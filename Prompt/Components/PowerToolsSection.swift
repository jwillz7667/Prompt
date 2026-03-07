//
//  PowerToolsSection.swift
//  Prompt
//
//  Container view for the 2x2 Power Tools grid with inline expanded content.
//

import SwiftUI

struct PowerToolsSection: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(StoreKitManager.self) private var storeKit

    enum PowerTool: String, CaseIterable, Identifiable {
        case platformOptimize
        case variations
        case sandbox
        case workflows

        var id: String { rawValue }

        var icon: String {
            switch self {
            case .platformOptimize: return "cpu"
            case .variations: return "rectangle.on.rectangle"
            case .sandbox: return "flask"
            case .workflows: return "arrow.triangle.branch"
            }
        }

        var title: String {
            switch self {
            case .platformOptimize: return "Platform"
            case .variations: return "Variations"
            case .sandbox: return "Sandbox"
            case .workflows: return "Workflows"
            }
        }

        var subtitle: String {
            switch self {
            case .platformOptimize: return "Optimize"
            case .variations: return "Generate alt"
            case .sandbox: return "Test prompts"
            case .workflows: return "Automate"
            }
        }

        var color: Color {
            switch self {
            case .platformOptimize: return Color.brandCyan
            case .variations: return Color.brandPurple
            case .sandbox: return .orange
            case .workflows: return .green
            }
        }

        var requiredTier: String {
            switch self {
            case .platformOptimize, .variations: return "PRO"
            case .sandbox, .workflows: return "PREMIUM"
            }
        }
    }

    @Binding var expandedTool: PowerTool?
    let enhancedPrompt: String
    let onApplyPrompt: (String) -> Void
    let onShowPaywall: () -> Void
    let onOpenSheet: (PowerTool) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            LiquidGlassSectionHeader(title: "Power Tools", icon: "bolt.fill")

            // 2x2 Grid
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(PowerTool.allCases) { tool in
                    PowerToolCard(
                        icon: tool.icon,
                        title: tool.title,
                        subtitle: tool.subtitle,
                        cardColor: tool.color,
                        isExpanded: expandedTool == tool,
                        isLocked: isLocked(tool),
                        requiredTier: isLocked(tool) ? tool.requiredTier : nil
                    ) {
                        handleToolTap(tool)
                    }
                }
            }

            // Expanded inline content
            if let tool = expandedTool {
                expandedContent(for: tool)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                    .padding(.top, 4)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: expandedTool?.rawValue)
    }

    // MARK: - Lock Check

    private func isLocked(_ tool: PowerTool) -> Bool {
        switch tool {
        case .platformOptimize, .variations:
            return storeKit.currentTier == .free
        case .sandbox, .workflows:
            return storeKit.currentTier != .premium
        }
    }

    // MARK: - Tool Tap

    private func handleToolTap(_ tool: PowerTool) {
        triggerHaptic(.light)

        if isLocked(tool) {
            onShowPaywall()
            return
        }

        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            if expandedTool == tool {
                expandedTool = nil
            } else {
                expandedTool = tool
            }
        }
    }

    // MARK: - Expanded Content

    @ViewBuilder
    private func expandedContent(for tool: PowerTool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Collapsible header
            Button {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    expandedTool = nil
                }
            } label: {
                HStack {
                    Label(tool.title + " " + tool.subtitle, systemImage: tool.icon)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(Color.adaptiveTextPrimary)

                    Spacer()

                    Image(systemName: "chevron.up")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.adaptiveTextTertiary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .buttonStyle(.plain)

            Divider()
                .padding(.horizontal, 16)

            // Tool-specific content
            Group {
                switch tool {
                case .platformOptimize:
                    InlinePlatformOptimizer(
                        enhancedPrompt: enhancedPrompt,
                        onApplyPrompt: onApplyPrompt,
                        onOpenSheet: { onOpenSheet(.platformOptimize) }
                    )

                case .variations:
                    InlineVariationsGenerator(
                        enhancedPrompt: enhancedPrompt,
                        onApplyPrompt: onApplyPrompt,
                        onOpenSheet: { onOpenSheet(.variations) }
                    )

                case .sandbox:
                    // Sandbox and Workflows open as sheets directly
                    VStack(spacing: 12) {
                        Text("Test your prompt across multiple AI platforms simultaneously.")
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(Color.adaptiveTextSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Button {
                            onOpenSheet(.sandbox)
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "flask.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                Text("Open Sandbox")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .foregroundStyle(.white)
                        }
                        .buttonStyle(LiquidGlassButtonStyle(
                            cornerRadius: 12,
                            tintColor: .orange,
                            intensity: .standard
                        ))
                    }

                case .workflows:
                    VStack(spacing: 12) {
                        Text("Create multi-step prompt workflows to automate complex tasks.")
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(Color.adaptiveTextSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Button {
                            onOpenSheet(.workflows)
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.triangle.branch")
                                    .font(.system(size: 14, weight: .semibold))
                                Text("Open Workflows")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .foregroundStyle(.white)
                        }
                        .buttonStyle(LiquidGlassButtonStyle(
                            cornerRadius: 12,
                            tintColor: .green,
                            intensity: .standard
                        ))
                    }
                }
            }
            .padding(16)
        }
        .liquidGlass(cornerRadius: 16, borderGlow: true)
    }

    // MARK: - Haptic

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}
