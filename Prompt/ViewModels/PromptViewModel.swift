//
//  PromptViewModel.swift
//  Prompt
//
//  Main view model for prompt enhancement functionality
//

import Foundation
import SwiftUI

@Observable
final class PromptViewModel {
    // MARK: - State

    var userPrompt: String = ""
    var enhancedPrompt: String = ""
    var isLoading: Bool = false
    var errorMessage: String?
    var showError: Bool = false
    var tokensUsed: Int = 0
    var showCopiedToast: Bool = false

    // MARK: - Private

    private let service = DeepseekService()

    // MARK: - Computed Properties

    var canEnhance: Bool {
        !userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLoading
    }

    var hasEnhancedPrompt: Bool {
        !enhancedPrompt.isEmpty
    }

    var characterCount: Int {
        userPrompt.count
    }

    // MARK: - Actions

    func enhancePrompt(settings: SettingsManager) async {
        guard !userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        guard settings.hasValidAPIKey else {
            errorMessage = EnhancerError.noAPIKey.localizedDescription
            showError = true
            return
        }

        isLoading = true
        errorMessage = nil
        enhancedPrompt = ""

        do {
            let result = try await service.enhancePrompt(
                userPrompt: userPrompt,
                apiKey: settings.apiKey,
                model: settings.selectedModel,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens
            )

            enhancedPrompt = result.enhancedPrompt
            tokensUsed = result.tokensUsed
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }

        isLoading = false
    }

    func copyToClipboard() {
        UIPasteboard.general.string = enhancedPrompt
        showCopiedToast = true

        Task {
            try? await Task.sleep(for: .seconds(2))
            showCopiedToast = false
        }
    }

    func clearAll() {
        userPrompt = ""
        enhancedPrompt = ""
        tokensUsed = 0
        errorMessage = nil
    }
}
