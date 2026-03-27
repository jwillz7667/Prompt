//
//  PromptViewModel.swift
//  Prompt
//
//  Main view model for prompt enhancement functionality
//

import Foundation
import SwiftUI
import WidgetKit
import UIKit

@Observable
@MainActor
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

    // Quota/Paywall state
    var showPaywall: Bool = false
    var quotaExceededMessage: String?

    // Favorite tracking for current prompt
    var currentPromptId: String?
    var isCurrentPromptFavorite: Bool = false

    // MARK: - Private

    private let service = DeepseekService()
    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid

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

        // Begin background task to ensure enhancement completes even if app is backgrounded
        beginBackgroundTask()

        // Start Live Activity
        EnhancementActivityManager.shared.startActivity(originalPrompt: userPrompt)

        do {
            // Update to enhancing stage
            EnhancementActivityManager.shared.updateProgress(stage: .enhancing)

            // Use streaming for real-time response. MAX mode runs on the reasoning model.
            let result = try await service.enhancePromptStream(
                userPrompt: userPrompt,
                model: settings.effectiveModel,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                mode: settings.promptMode,
                modality: settings.selectedModality,
                subModality: settings.effectiveSubModality,
            ) { [self] token in
                // Update UI with each token on main thread
                Task { @MainActor [self, token] in
                    self.enhancedPrompt += token
                }
            }

            // Update to optimizing stage briefly
            EnhancementActivityManager.shared.updateProgress(stage: .optimizing)

            tokensUsed = result.tokensUsed

            // Complete the Live Activity
            EnhancementActivityManager.shared.completeActivity(enhancedPrompt: result.enhancedPrompt)

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
            // Check if it's a quota exceeded error - show paywall instead of error
            if error.isQuotaExceeded {
                quotaExceededMessage = "You've reached your daily prompt limit. Upgrade to continue enhancing prompts."
                showPaywall = true
                // End Live Activity gracefully
                EnhancementActivityManager.shared.failActivity(errorMessage: "Daily limit reached")
            } else {
                let appError = ErrorHandler.shared.mapToAppError(error)
                errorMessage = appError.userMessage
                showError = true
                ErrorHandler.shared.handleSilently(error, context: "enhancePrompt")
                // Fail the Live Activity
                EnhancementActivityManager.shared.failActivity(errorMessage: appError.userMessage)
            }
        } catch {
            let appError = ErrorHandler.shared.mapToAppError(error)
            errorMessage = appError.userMessage
            showError = true
            ErrorHandler.shared.handleSilently(error, context: "enhancePrompt")
            // Fail the Live Activity
            EnhancementActivityManager.shared.failActivity(errorMessage: appError.userMessage)
        }

        isLoading = false
        isStreaming = false

        // End background task when complete
        endBackgroundTask()
    }

    // MARK: - Background Task Management

    private func beginBackgroundTask() {
        // End any existing task first
        endBackgroundTask()

        backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "PromptEnhancement") { [weak self] in
            // System is about to terminate the task
            // The task will continue on the server side, but we can't receive the response
            Task { @MainActor in
                self?.endBackgroundTask()
            }
        }
    }

    private func endBackgroundTask() {
        guard backgroundTaskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskId)
        backgroundTaskId = .invalid
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
        currentPromptId = nil
        isCurrentPromptFavorite = false
    }

    /// Update the current prompt ID after saving
    func setCurrentPromptId(_ id: String) {
        currentPromptId = id
        isCurrentPromptFavorite = false
    }
}
