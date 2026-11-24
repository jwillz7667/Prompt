//
//  AIDataConsentStore.swift
//  Prompt
//
//  Records each account's permission to send its content to third-party AI
//  service providers (App Review 5.1.2(i)). Consent is per account and per
//  disclosure version and lives on the server, so a reinstall or a new
//  device does not ask again; the local copy only lets the launch gate
//  decide without a network round trip.
//

import Foundation
import Observation
import UIKit

// MARK: - Wire Models

/// `aiDataConsent` in every user payload and consent response.
nonisolated struct ServerAIDataConsent: Codable, Sendable, Equatable {
    let version: Int
    let grantedAt: String
}

/// What a user payload said about consent. `.unknown` means the field was
/// absent (a backend that predates server-side consent), which must never be
/// read as "withdrawn".
nonisolated enum ServerConsentSnapshot: Codable, Sendable, Equatable {
    case unknown
    case none
    case granted(ServerAIDataConsent)
}

nonisolated struct AIConsentStateResponse: Decodable, Sendable {
    let aiDataConsent: ServerAIDataConsent?
    let requiredVersion: Int
}

nonisolated struct GrantAIConsentRequest: Encodable, Sendable {
    let version: Int
}

// MARK: - Remote

protocol AIDataConsentRemote: Sendable {
    func grant(version: Int) async throws -> AIConsentStateResponse
    func withdraw() async throws -> AIConsentStateResponse
}

struct APIAIDataConsentRemote: AIDataConsentRemote {
    func grant(version: Int) async throws -> AIConsentStateResponse {
        try await APIClient.shared.request(
            "/users/me/ai-consent",
            method: .post,
            body: GrantAIConsentRequest(version: version)
        )
    }

    func withdraw() async throws -> AIConsentStateResponse {
        try await APIClient.shared.request("/users/me/ai-consent", method: .delete)
    }
}

// MARK: - Store

@MainActor
@Observable
final class AIDataConsentStore {
    static let shared = AIDataConsentStore()

    /// Bump when the disclosure text changes materially so every account is
    /// asked again.
    nonisolated static let currentDisclosureVersion = 1

    /// True while an AI request is waiting on the consent prompt (the server
    /// answered 403 AI_CONSENT_REQUIRED). RootView presents the prompt over
    /// the app so the waiting screen keeps its state and the request retries.
    private(set) var isPromptPresented = false
    private(set) var isSubmitting = false

    private let defaults: UserDefaults
    private let remote: AIDataConsentRemote
    /// Observed mirror of the persisted versions so RootView re-evaluates its
    /// stage whenever consent changes.
    private var localVersions: [String: Int] = [:]
    /// Version the server last demanded; consenting records at least this.
    private var serverRequiredVersion = 0
    private var promptWaiters: [CheckedContinuation<Bool, Never>] = []

    init(defaults: UserDefaults = .standard, remote: AIDataConsentRemote = APIAIDataConsentRemote()) {
        self.defaults = defaults
        self.remote = remote
    }

    // MARK: Queries

    func hasConsented(userId: String) -> Bool {
        localVersion(for: userId) >= Self.currentDisclosureVersion
    }

    // MARK: Granting and withdrawing

    /// Records consent on the server, then locally. Throws (leaving the user
    /// on the consent screen) when the server did not confirm it, except for a
    /// backend that predates the endpoint, where the local record is kept
    /// unconfirmed and pushed on a later sync.
    func grantConsent(userId: String) async throws {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        // The server's version counter decides when everyone is asked again;
        // the text this build shows is the current disclosure from the
        // user's point of view.
        let version = max(Self.currentDisclosureVersion, serverRequiredVersion)
        do {
            let state = try await remote.grant(version: version)
            serverRequiredVersion = state.requiredVersion
            store(version: state.aiDataConsent?.version ?? version, isServerConfirmed: true, userId: userId)
        } catch APIError.notFound {
            store(version: version, isServerConfirmed: false, userId: userId)
        }
        resolvePrompt(isGranted: true)
    }

    /// Withdraws consent on the server and locally. The launch gate then shows
    /// the consent screen before any further AI use.
    func withdrawConsent(userId: String) async throws {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        let state = try await remote.withdraw()
        serverRequiredVersion = state.requiredVersion
        clear(userId: userId)
    }

    /// Called when an account is deleted so a re-created account is asked again.
    func forgetConsent(userId: String) {
        clear(userId: userId)
        resolvePrompt(isGranted: false)
    }

    // MARK: Server sync

    /// Reconciles the local record with the consent in a user payload (sign-in,
    /// session restore, profile refresh).
    func sync(userId: String, server snapshot: ServerConsentSnapshot) async {
        switch snapshot {
        case .unknown:
            return
        case .granted(let consent):
            let local = localVersion(for: userId)
            if consent.version >= local {
                store(version: consent.version, isServerConfirmed: true, userId: userId)
            } else {
                await pushLocalConsent(version: local, userId: userId)
            }
        case .none:
            let local = localVersion(for: userId)
            guard local > 0 else { return }
            if isServerConfirmed(userId: userId) {
                // The server had this consent and no longer does: it was
                // withdrawn on another device.
                clear(userId: userId)
            } else {
                // Granted on a build that only stored consent on-device.
                await pushLocalConsent(version: local, userId: userId)
            }
        }
    }

    private func pushLocalConsent(version: Int, userId: String) async {
        do {
            let state = try await remote.grant(version: version)
            serverRequiredVersion = state.requiredVersion
            store(version: state.aiDataConsent?.version ?? version, isServerConfirmed: true, userId: userId)
        } catch {
            // Retried on the next sync; the server gate re-prompts if needed.
            ErrorHandler.shared.handleSilently(error, context: "AIDataConsentStore.pushLocalConsent")
        }
    }

    // MARK: Prompting from a rejected request

    /// Called by APIClient on 403 AI_CONSENT_REQUIRED. Shows the consent
    /// prompt and returns whether the user agreed (the caller then retries).
    static func requestConsentFromUser(requiredVersion: Int) async -> Bool {
        await shared.requestConsent(requiredVersion: requiredVersion)
    }

    /// Returns false without prompting when no UI can show the prompt (app
    /// not active, e.g. a Siri intent) or nobody is signed in.
    func requestConsent(requiredVersion: Int) async -> Bool {
        serverRequiredVersion = max(serverRequiredVersion, requiredVersion)
        guard UIApplication.shared.applicationState == .active,
              AuthManager.shared.currentUser != nil else {
            return false
        }
        isPromptPresented = true
        return await withCheckedContinuation { continuation in
            promptWaiters.append(continuation)
        }
    }

    /// The user left the prompt without agreeing; waiting requests fail.
    func declinePrompt() {
        resolvePrompt(isGranted: false)
    }

    private func resolvePrompt(isGranted: Bool) {
        isPromptPresented = false
        let waiters = promptWaiters
        promptWaiters.removeAll()
        for waiter in waiters {
            waiter.resume(returning: isGranted)
        }
    }

    // MARK: Persistence

    private func localVersion(for userId: String) -> Int {
        if let cached = localVersions[userId] { return cached }
        return defaults.integer(forKey: Self.versionKey(for: userId))
    }

    private func isServerConfirmed(userId: String) -> Bool {
        defaults.bool(forKey: Self.confirmedKey(for: userId))
    }

    private func store(version: Int, isServerConfirmed: Bool, userId: String) {
        defaults.set(version, forKey: Self.versionKey(for: userId))
        defaults.set(Date(), forKey: Self.dateKey(for: userId))
        defaults.set(isServerConfirmed, forKey: Self.confirmedKey(for: userId))
        localVersions[userId] = version
    }

    private func clear(userId: String) {
        defaults.removeObject(forKey: Self.versionKey(for: userId))
        defaults.removeObject(forKey: Self.dateKey(for: userId))
        defaults.removeObject(forKey: Self.confirmedKey(for: userId))
        localVersions[userId] = 0
    }

    private static func versionKey(for userId: String) -> String {
        "com.promptomize.aiDataConsent.version.\(userId)"
    }

    private static func dateKey(for userId: String) -> String {
        "com.promptomize.aiDataConsent.date.\(userId)"
    }

    private static func confirmedKey(for userId: String) -> String {
        "com.promptomize.aiDataConsent.serverConfirmed.\(userId)"
    }
}
