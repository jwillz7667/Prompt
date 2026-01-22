//
//  EnhancementLiveActivity.swift
//  PromptWidgetExtension
//
//  Live Activity UI for prompt enhancement progress
//

import ActivityKit
import WidgetKit
import SwiftUI

struct EnhancementLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EnhancementActivityAttributes.self) { context in
            // Lock Screen / Banner UI
            LockScreenView(context: context)
                .activityBackgroundTint(.black.opacity(0.8))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.stage.icon)
                        .font(.title2)
                        .foregroundStyle(stageColor(for: context.state.stage))
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.title3.monospacedDigit())
                        .fontWeight(.bold)
                }

                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.stage.displayName)
                        .font(.headline)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        ProgressView(value: context.state.progress)
                            .progressViewStyle(.linear)
                            .tint(stageColor(for: context.state.stage))

                        Text(context.state.statusMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)

                        if let preview = context.state.enhancedPreview {
                            Text(preview)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                                .padding(.top, 4)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "sparkles")
                    .foregroundStyle(.blue)
            } compactTrailing: {
                if context.state.stage == .completed {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else if context.state.stage == .failed {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.red)
                } else {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .scaleEffect(0.6)
                }
            } minimal: {
                Image(systemName: "sparkles")
                    .foregroundStyle(.blue)
            }
        }
    }

    private func stageColor(for stage: EnhancementStage) -> Color {
        switch stage {
        case .analyzing:
            return .blue
        case .enhancing:
            return .purple
        case .optimizing:
            return .orange
        case .completed:
            return .green
        case .failed:
            return .red
        }
    }
}

// MARK: - Lock Screen View

struct LockScreenView: View {
    let context: ActivityViewContext<EnhancementActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundStyle(.blue)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Enhancing Prompt")
                        .font(.headline)
                    Text(context.attributes.promptPreview)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                StageIndicator(stage: context.state.stage)
            }

            // Progress
            VStack(alignment: .leading, spacing: 4) {
                ProgressView(value: context.state.progress)
                    .progressViewStyle(.linear)
                    .tint(stageColor(for: context.state.stage))

                HStack {
                    Text(context.state.statusMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if context.state.stage.isInProgress {
                        Text(context.attributes.startTime, style: .timer)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            // Enhanced preview (if complete)
            if let preview = context.state.enhancedPreview {
                HStack {
                    Image(systemName: "arrow.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(preview)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .padding(.top, 4)
            }
        }
        .padding()
    }

    private func stageColor(for stage: EnhancementStage) -> Color {
        switch stage {
        case .analyzing: return .blue
        case .enhancing: return .purple
        case .optimizing: return .orange
        case .completed: return .green
        case .failed: return .red
        }
    }
}

// MARK: - Stage Indicator

struct StageIndicator: View {
    let stage: EnhancementStage

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: stage.icon)

            if stage == .completed {
                Text("Done")
            } else if stage == .failed {
                Text("Error")
            } else {
                Text("\(Int(stage.progress * 100))%")
            }
        }
        .font(.caption)
        .fontWeight(.semibold)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(stageColor.opacity(0.2))
        .foregroundStyle(stageColor)
        .clipShape(Capsule())
    }

    var stageColor: Color {
        switch stage {
        case .analyzing: return .blue
        case .enhancing: return .purple
        case .optimizing: return .orange
        case .completed: return .green
        case .failed: return .red
        }
    }
}

// MARK: - Preview

#Preview("Dynamic Island Expanded", as: .dynamicIsland(.expanded), using: EnhancementActivityAttributes(
    originalPrompt: "Write a blog post about AI",
    promptPreview: "Write a blog post about AI",
    startTime: Date()
)) {
    EnhancementLiveActivity()
} contentStates: {
    EnhancementActivityAttributes.ContentState(
        stage: .enhancing,
        progress: 0.5,
        statusMessage: "Applying enhancement techniques...",
        enhancedPreview: nil
    )
}

#Preview("Lock Screen", as: .content, using: EnhancementActivityAttributes(
    originalPrompt: "Write a blog post about AI",
    promptPreview: "Write a blog post about AI",
    startTime: Date()
)) {
    EnhancementLiveActivity()
} contentStates: {
    EnhancementActivityAttributes.ContentState(
        stage: .completed,
        progress: 1.0,
        statusMessage: "Enhancement complete!",
        enhancedPreview: "You are an expert tech writer with 10+ years of experience..."
    )
}
