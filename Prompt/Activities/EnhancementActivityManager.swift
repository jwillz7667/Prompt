//
//  EnhancementActivityManager.swift
//  Prompt
//
//  Manages Live Activity lifecycle for prompt enhancement
//

import ActivityKit
import Foundation

@MainActor
final class EnhancementActivityManager {
    static let shared = EnhancementActivityManager()

    private var currentActivity: Activity<EnhancementActivityAttributes>?

    private init() {}

    // MARK: - Activity Lifecycle

    func startActivity(originalPrompt: String) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("Live Activities are not enabled")
            return
        }

        // End any existing activity
        endAllActivities()

        // Create preview (truncated version of prompt)
        let preview = String(originalPrompt.prefix(50)) + (originalPrompt.count > 50 ? "..." : "")

        let attributes = EnhancementActivityAttributes(
            originalPrompt: originalPrompt,
            promptPreview: preview,
            startTime: Date()
        )

        let initialState = EnhancementActivityAttributes.ContentState(
            stage: .analyzing,
            progress: 0.25,
            statusMessage: "Analyzing your prompt...",
            enhancedPreview: nil
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: initialState, staleDate: nil),
                pushType: nil
            )
            currentActivity = activity

            // Store activity ID in shared storage
            SharedDataManager.shared.currentActivityId = activity.id

            print("Live Activity started: \(activity.id)")
        } catch {
            print("Failed to start Live Activity: \(error)")
        }
    }

    func updateProgress(stage: EnhancementStage, message: String? = nil) {
        guard let activity = currentActivity else { return }

        let statusMessage = message ?? defaultMessage(for: stage)

        let updatedState = EnhancementActivityAttributes.ContentState(
            stage: stage,
            progress: stage.progress,
            statusMessage: statusMessage,
            enhancedPreview: nil
        )

        Task {
            await activity.update(
                ActivityContent(state: updatedState, staleDate: nil)
            )
        }
    }

    func completeActivity(enhancedPrompt: String) {
        guard let activity = currentActivity else { return }

        // Create preview of enhanced prompt
        let preview = String(enhancedPrompt.prefix(100)) + (enhancedPrompt.count > 100 ? "..." : "")

        let finalState = EnhancementActivityAttributes.ContentState(
            stage: .completed,
            progress: 1.0,
            statusMessage: "Enhancement complete!",
            enhancedPreview: preview
        )

        Task {
            await activity.update(
                ActivityContent(state: finalState, staleDate: nil)
            )

            // End the activity after a short delay so user sees the completion
            try? await Task.sleep(for: .seconds(3))
            await activity.end(
                ActivityContent(state: finalState, staleDate: nil),
                dismissalPolicy: .default
            )

            await MainActor.run {
                self.currentActivity = nil
                SharedDataManager.shared.currentActivityId = nil
            }
        }
    }

    func failActivity(errorMessage: String) {
        guard let activity = currentActivity else { return }

        let failedState = EnhancementActivityAttributes.ContentState(
            stage: .failed,
            progress: 0.0,
            statusMessage: errorMessage,
            enhancedPreview: nil
        )

        Task {
            await activity.end(
                ActivityContent(state: failedState, staleDate: nil),
                dismissalPolicy: .immediate
            )

            await MainActor.run {
                self.currentActivity = nil
                SharedDataManager.shared.currentActivityId = nil
            }
        }
    }

    func endAllActivities() {
        Task {
            for activity in Activity<EnhancementActivityAttributes>.activities {
                let finalState = EnhancementActivityAttributes.ContentState(
                    stage: .completed,
                    progress: 1.0,
                    statusMessage: "Dismissed",
                    enhancedPreview: nil
                )
                await activity.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .immediate
                )
            }
            currentActivity = nil
            SharedDataManager.shared.currentActivityId = nil
        }
    }

    // MARK: - Helpers

    private func defaultMessage(for stage: EnhancementStage) -> String {
        switch stage {
        case .analyzing:
            return "Analyzing your prompt..."
        case .enhancing:
            return "Applying enhancement techniques..."
        case .optimizing:
            return "Optimizing for clarity..."
        case .completed:
            return "Enhancement complete!"
        case .failed:
            return "Enhancement failed"
        }
    }

    var hasActiveActivity: Bool {
        currentActivity != nil
    }
}
