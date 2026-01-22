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
        let shared = SharedDataManager.shared

        if shared.isUnlimited {
            return .result(
                dialog: "You have unlimited prompts with your \(shared.subscriptionTier) subscription"
            )
        }

        let remaining = shared.remainingPrompts
        let used = shared.dailyPromptsUsed
        let limit = shared.dailyPromptsLimit

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
