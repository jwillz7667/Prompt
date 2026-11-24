//
//  AIDataConsentStore.swift
//  Prompt
//
//  Records each account's permission to send its content to third-party AI
//  service providers (App Review 5.1.2(i)). Consent is per account and per
//  disclosure version: a new disclosure asks again.
//

import Foundation
import Observation

@MainActor
@Observable
final class AIDataConsentStore {
    static let shared = AIDataConsentStore()

    /// Bump when the disclosure text changes materially so every account is
    /// asked again.
    static let currentDisclosureVersion = 1

    private let defaults: UserDefaults
    /// Observed so RootView re-evaluates its stage once consent is given.
    private var consentedUserIds: Set<String> = []

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func hasConsented(userId: String) -> Bool {
        if consentedUserIds.contains(userId) { return true }
        guard defaults.integer(forKey: Self.versionKey(for: userId)) >= Self.currentDisclosureVersion else {
            return false
        }
        return true
    }

    func recordConsent(userId: String) {
        defaults.set(Self.currentDisclosureVersion, forKey: Self.versionKey(for: userId))
        defaults.set(Date(), forKey: Self.dateKey(for: userId))
        consentedUserIds.insert(userId)
    }

    /// Called when an account is deleted so a re-created account is asked again.
    func forgetConsent(userId: String) {
        defaults.removeObject(forKey: Self.versionKey(for: userId))
        defaults.removeObject(forKey: Self.dateKey(for: userId))
        consentedUserIds.remove(userId)
    }

    private static func versionKey(for userId: String) -> String {
        "com.promptomize.aiDataConsent.version.\(userId)"
    }

    private static func dateKey(for userId: String) -> String {
        "com.promptomize.aiDataConsent.date.\(userId)"
    }
}
