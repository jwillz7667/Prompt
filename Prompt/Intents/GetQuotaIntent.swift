//
//  GetQuotaIntent.swift
//  Prompt
//
//  App Intent reporting whether Promptomize Premium is active, from the
//  entitlement the app last verified with the server.
//

import AppIntents
import Foundation

struct GetQuotaIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Subscription"
    static var description = IntentDescription("Check whether your Promptomize Premium subscription is active")

    static var openAppWhenRun: Bool = false

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let status = await MainActor.run {
            (
                isSignedIn: SharedDataManager.shared.isAuthenticated,
                isEntitled: SharedDataManager.shared.subscriptionTier == SubscriptionTier.premium.rawValue
            )
        }

        guard status.isSignedIn else {
            return .result(dialog: "Open Promptomize and sign in to get started.")
        }
        guard status.isEntitled else {
            return .result(dialog: "Subscription required — open Promptomize to start Premium.")
        }
        return .result(dialog: "Promptomize Premium is active.")
    }
}
