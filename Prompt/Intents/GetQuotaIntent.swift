//
//  GetQuotaIntent.swift
//  Prompt
//
//  App Intent for checking prompt quota via Siri and Shortcuts
//

import AppIntents
import Foundation

struct GetQuotaIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Prompt Quota"
    static var description = IntentDescription("Check how many prompts you have left today")

    static var openAppWhenRun: Bool = false

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let quota = await MainActor.run {
            (
                SharedDataManager.shared.isUnlimited,
                SharedDataManager.shared.subscriptionTier,
                SharedDataManager.shared.remainingPrompts,
                SharedDataManager.shared.dailyPromptsUsed,
                SharedDataManager.shared.dailyPromptsLimit
            )
        }

        if quota.0 {
            return .result(
                dialog: "You have unlimited prompts with your \(quota.1) subscription"
            )
        }

        let remaining = quota.2
        let used = quota.3
        let limit = quota.4

        if remaining == 0 {
            return .result(
                dialog: "You've used all \(limit) prompts today. Your quota resets at midnight."
            )
        } else if remaining == 1 {
            return .result(
                dialog: "You have 1 prompt left today. You've used \(used) out of \(limit)."
            )
        } else {
            return .result(
                dialog: "You have \(remaining) prompts left today. You've used \(used) out of \(limit)."
            )
        }
    }
}
