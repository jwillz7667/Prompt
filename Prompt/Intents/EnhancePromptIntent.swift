//
//  EnhancePromptIntent.swift
//  Prompt
//
//  App Intent for enhancing prompts via Siri and Shortcuts
//

import AppIntents
import Foundation

struct EnhancePromptIntent: AppIntent {
    static var title: LocalizedStringResource = "Enhance Prompt"
    static var description = IntentDescription("Transform your prompt into a more effective version using AI")

    static var openAppWhenRun: Bool = false

    @Parameter(title: "Prompt Text", description: "The text you want to enhance")
    var promptText: String

    init() {}

    init(promptText: String) {
        self.promptText = promptText
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        // Check authentication
        guard SharedKeychainHelper.hasValidTokens else {
            throw EnhanceIntentError.notAuthenticated
        }

        // Check quota
        let shared = SharedDataManager.shared
        if !shared.isUnlimited && shared.remainingPrompts <= 0 {
            throw EnhanceIntentError.quotaExceeded
        }

        // Create the enhancement service and perform the request
        let service = DeepseekService()
        let settings = SettingsManager()

        do {
            let result = try await service.enhancePrompt(
                userPrompt: promptText,
                model: settings.selectedModel,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens
            )

            // Update shared storage
            let promptId = UUID().uuidString
            shared.addRecentPrompt(id: promptId, original: promptText, enhanced: result.enhancedPrompt)

            return .result(
                value: result.enhancedPrompt,
                dialog: "Here's your enhanced prompt"
            )
        } catch {
            throw EnhanceIntentError.enhancementFailed(error.localizedDescription)
        }
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Enhance \(\.$promptText)")
    }
}

// MARK: - Error Types

enum EnhanceIntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
    case notAuthenticated
    case quotaExceeded
    case enhancementFailed(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notAuthenticated:
            return "Please sign in to Promptomize first"
        case .quotaExceeded:
            return "You've reached your daily prompt limit. Upgrade for more prompts."
        case .enhancementFailed(let message):
            return "Enhancement failed: \(message)"
        }
    }
}
