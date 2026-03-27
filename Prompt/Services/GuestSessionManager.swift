//
//  GuestSessionManager.swift
//  Prompt
//
//  Tracks the unauthenticated onboarding allowance and auth gate state.
//

import Foundation
import Observation

enum GuestSubmissionDecision: Sendable {
    case allowed
    case blocked(message: String)
    case requiresAuthentication(message: String)
}

@Observable
@MainActor
final class GuestSessionManager {
    static let shared = GuestSessionManager()

    var quota: GuestQuotaState = .initial
    var shouldPresentAuthenticationGate = false

    private let appGroupId = "group.com.res.promptomizer"
    private let quotaKey = "guestQuotaState"

    private var appGroupDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    private init() {
        load()
    }

    func synchronize(with quota: GuestQuotaState?) {
        guard let quota else { return }
        guard self.quota != quota else { return }
        self.quota = quota
        persist()
    }

    func submissionDecision(for mode: PromptGenerationMode) -> GuestSubmissionDecision {
        // All prompt submissions require authentication - prompt users to sign in
        shouldPresentAuthenticationGate = true
        return .requiresAuthentication(
            message: "Sign in with Apple to start enhancing prompts and claim your 7-day free trial."
        )
    }

    func presentAuthenticationGate() {
        shouldPresentAuthenticationGate = true
    }

    func completeAuthenticationFlow() {
        shouldPresentAuthenticationGate = false
    }

    private func load() {
        guard let data = appGroupDefaults?.data(forKey: quotaKey),
              let decoded = try? JSONDecoder().decode(GuestQuotaState.self, from: data) else {
            quota = .initial
            return
        }

        quota = decoded
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(quota) else { return }
        appGroupDefaults?.set(data, forKey: quotaKey)
    }
}
