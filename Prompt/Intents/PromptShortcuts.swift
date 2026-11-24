//
//  PromptShortcuts.swift
//  Prompt
//
//  App Shortcuts provider for automatic Siri integration
//

import AppIntents

struct PromptShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: EnhancePromptIntent(),
            phrases: [
                "Enhance prompt with \(.applicationName)",
                "Improve my prompt with \(.applicationName)",
                "\(.applicationName) enhance",
                "\(.applicationName) this prompt",
                "Make my prompt better with \(.applicationName)"
            ],
            shortTitle: "Enhance Prompt",
            systemImageName: "sparkles"
        )

        AppShortcut(
            intent: GetQuotaIntent(),
            phrases: [
                "Check my \(.applicationName) subscription",
                "Is \(.applicationName) Premium active",
                "\(.applicationName) subscription status"
            ],
            shortTitle: "Check Subscription",
            systemImageName: "crown"
        )

        AppShortcut(
            intent: OpenEnhanceIntent(),
            phrases: [
                "Open \(.applicationName)",
                "Start \(.applicationName)",
                "New prompt in \(.applicationName)"
            ],
            shortTitle: "Open Promptomize",
            systemImageName: "text.bubble"
        )
    }
}

// MARK: - Open App Intent

struct OpenEnhanceIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Promptomize"
    static var description = IntentDescription("Open Promptomize to enhance a new prompt")

    static var openAppWhenRun: Bool = true

    init() {}

    func perform() async throws -> some IntentResult {
        return .result()
    }
}
