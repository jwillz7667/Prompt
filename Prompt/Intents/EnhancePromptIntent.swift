//
//  EnhancePromptIntent.swift
//  Prompt
//
//  App Intent for enhancing prompts via Siri, Spotlight, and the Shortcuts app.
//  Enhancement runs through the backend (same path as the app), so the same
//  subscription requirement and fair-use limit apply.
//

import AppIntents
import Foundation
import UIKit

struct EnhancePromptIntent: AppIntent {
    static var title: LocalizedStringResource = "Enhance Prompt"
    static var description = IntentDescription(
        "Transform a rough prompt into a more effective version using AI."
    )

    // Run entirely in the background so the intent can be chained inside
    // Shortcuts (e.g. "enhance my clipboard") without launching the app.
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Prompt", description: "The text you want to enhance")
    var promptText: String

    init() {}

    init(promptText: String) {
        self.promptText = promptText
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let trimmed = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw EnhanceIntentError.emptyPrompt
        }

        // Auth lives in the shared keychain (App Group) so Siri, the widget, and
        // the keyboard extension all observe the same session. No tokens means
        // there is no signed-in user to enhance on behalf of.
        guard SharedKeychainHelper.hasValidTokens else {
            throw EnhanceIntentError.notAuthenticated
        }

        let enhanced: String
        do {
            let response: EnhancePromptIntentResponse = try await APIClient.shared.request(
                "/prompts/enhance",
                method: .post,
                body: EnhancePromptIntentRequest(prompt: trimmed, modality: "text"),
                requiresAuth: true,
                timeoutInterval: 120
            )
            enhanced = response.enhancedPrompt
        } catch let error as APIError {
            throw EnhanceIntentError(apiError: error)
        }

        // Copy the result to the clipboard and record it in shared storage so
        // "enhance my clipboard"-style shortcuts can chain the output into
        // another app, and the widget's recent list stays in sync.
        await MainActor.run {
            UIPasteboard.general.string = enhanced
            SharedDataManager.shared.addRecentPrompt(
                id: UUID().uuidString,
                original: trimmed,
                enhanced: enhanced
            )
        }

        return .result(
            value: enhanced,
            dialog: "Here's your enhanced prompt. It's been copied to your clipboard."
        )
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Enhance \(\.$promptText)")
    }
}

// MARK: - Request / Response

private nonisolated struct EnhancePromptIntentRequest: Encodable, Sendable {
    let prompt: String
    let modality: String
}

private nonisolated struct EnhancePromptIntentResponse: Decodable, Sendable {
    let enhancedPrompt: String
}

// MARK: - Error Types

enum EnhanceIntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
    case emptyPrompt
    case notAuthenticated
    case subscriptionRequired
    case fairUseLimit(resetAt: Date?)
    case enhancementFailed(String)

    init(apiError: APIError) {
        switch apiError {
        case .notAuthenticated, .unauthorized:
            self = .notAuthenticated
        case .subscriptionRequired, .quotaExceeded, .featureLocked:
            self = .subscriptionRequired
        case .fairUseLimit(let resetAt):
            self = .fairUseLimit(resetAt: resetAt)
        default:
            self = .enhancementFailed(apiError.errorDescription ?? ServiceErrorCode.internalError.userMessage)
        }
    }

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .emptyPrompt:
            return "Enter a prompt to enhance."
        case .notAuthenticated:
            return "Open Promptomize and sign in to enhance prompts with Siri."
        case .subscriptionRequired:
            return "Subscription required — open Promptomize to start Premium."
        case .fairUseLimit(let resetAt):
            return "\(ServiceMessages.fairUseLimit(resetAt: resetAt))"
        case .enhancementFailed(let message):
            return "\(message)"
        }
    }
}
