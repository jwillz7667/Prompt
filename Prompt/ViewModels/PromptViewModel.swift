//
//  PromptViewModel.swift
//  Prompt
//
//  Main view model for prompt enhancement functionality
//

import Foundation
import SwiftUI
import WidgetKit

@Observable
final class PromptViewModel {
    // MARK: - State

    var userPrompt: String = ""
    var enhancedPrompt: String = ""
    var isLoading: Bool = false
    var isStreaming: Bool = false
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

        // Check if user is authenticated
        guard await APIClient.shared.isAuthenticated else {
            errorMessage = EnhancerError.notAuthenticated.localizedDescription
            showError = true
            return
        }

        isLoading = true
        isStreaming = true
        errorMessage = nil
        enhancedPrompt = ""

        // Start Live Activity
        await EnhancementActivityManager.shared.startActivity(originalPrompt: userPrompt)

        do {
            // Update to enhancing stage
            await EnhancementActivityManager.shared.updateProgress(stage: .enhancing)

            // Use streaming for real-time response
            // effectiveModel returns reasoner if Deep Think is enabled, chat otherwise
            let result = try await service.enhancePromptStream(
                userPrompt: userPrompt,
                model: settings.effectiveModel,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                tone: settings.selectedTone,
                length: settings.outputLength,
                customInstructions: settings.customInstructions.isEmpty ? nil : settings.customInstructions
            ) { [weak self] token in
                // Update UI with each token on main thread
                Task { @MainActor in
                    self?.enhancedPrompt += token
                }
            }

            // Update to optimizing stage briefly
            await EnhancementActivityManager.shared.updateProgress(stage: .optimizing)

            tokensUsed = result.tokensUsed

            // Complete the Live Activity
            await EnhancementActivityManager.shared.completeActivity(enhancedPrompt: result.enhancedPrompt)

            // Update shared storage for widgets
            let promptId = UUID().uuidString
            SharedDataManager.shared.addRecentPrompt(
                id: promptId,
                original: userPrompt,
                enhanced: result.enhancedPrompt
            )

            // Reload widget timelines
            WidgetCenter.shared.reloadAllTimelines()

        } catch let error as APIError {
            let appError = ErrorHandler.shared.mapToAppError(error)
            errorMessage = appError.userMessage
            showError = true
            ErrorHandler.shared.handleSilently(error, context: "enhancePrompt")
            // Fail the Live Activity
            await EnhancementActivityManager.shared.failActivity(errorMessage: appError.userMessage)
        } catch {
            let appError = ErrorHandler.shared.mapToAppError(error)
            errorMessage = appError.userMessage
            showError = true
            ErrorHandler.shared.handleSilently(error, context: "enhancePrompt")
            // Fail the Live Activity
            await EnhancementActivityManager.shared.failActivity(errorMessage: appError.userMessage)
        }

        isLoading = false
        isStreaming = false
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
