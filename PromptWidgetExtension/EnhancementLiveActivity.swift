//
//  EnhancementLiveActivity.swift
//  PromptWidgetExtension
//
//  Live Activity UI for prompt enhancement progress
//

import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Brand Colors (Live Activity)

private extension Color {
    static let brandPurple = Color(red: 91/255, green: 76/255, blue: 219/255)
    static let brandCyan = Color(red: 0/255, green: 230/255, blue: 230/255)
}

struct EnhancementLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EnhancementActivityAttributes.self) { context in
            // Lock Screen / Banner UI
            LockScreenView(context: context)
                .activityBackgroundTint(.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.stage.icon)
                        .font(.system(.title2, design: .rounded))
                        .foregroundStyle(stageColor(for: context.state.stage))
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.system(.title3, design: .rounded).monospacedDigit())
                        .fontWeight(.bold)
                }

                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.stage.displayName)
                        .font(.system(.headline, design: .rounded))
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        ProgressView(value: context.state.progress)
                            .progressViewStyle(.linear)
                            .tint(stageColor(for: context.state.stage))

                        Text(context.state.statusMessage)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)

                        if let preview = context.state.enhancedPreview {
                            Text(preview)
                                .font(.system(.caption2, design: .rounded))
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                                .padding(.top, 4)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "sparkles")
                    .foregroundStyle(Color.brandCyan)
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
                    .foregroundStyle(Color.brandCyan)
            }
        }
    }

    private func stageColor(for stage: EnhancementStage) -> Color {
        switch stage {
        case .analyzing:
            return .brandPurple
        case .enhancing:
            return .brandCyan
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
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .foregroundStyle(Color.brandCyan)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Enhancing Prompt")
                        .font(.system(.headline, design: .rounded))
                    Text(context.attributes.promptPreview)
                        .font(.system(.caption, design: .rounded))
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
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(.secondary)

                    Spacer()

                    if context.state.stage.isInProgress {
                        Text(context.attributes.startTime, style: .timer)
                            .font(.system(.caption, design: .rounded).monospacedDigit())
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            // Enhanced preview (if complete)
            if let preview = context.state.enhancedPreview {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.right")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(Color.brandCyan)
                    Text(preview)
                        .font(.system(.caption, design: .rounded))
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
        case .analyzing: return .brandPurple
        case .enhancing: return .brandCyan
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
        .font(.system(.caption, design: .rounded, weight: .semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(stageColor.opacity(0.2))
        )
        .foregroundStyle(stageColor)
    }

    var stageColor: Color {
        switch stage {
        case .analyzing: return .brandPurple
        case .enhancing: return .brandCyan
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
