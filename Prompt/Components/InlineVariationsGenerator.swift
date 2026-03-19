//
//  InlineVariationsGenerator.swift
//  Prompt
//
//  Compact inline version of VariationsView for Power Tools section.
//

import SwiftUI

struct InlineVariationsGenerator: View {
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var service = VariationsService.shared

    let enhancedPrompt: String
    let onApplyPrompt: (String) -> Void
    let onOpenSheet: () -> Void

    @State private var selectedStrategy: VariationStrategy = .quick
    @State private var trackedVariationId: String?
    @State private var localError: String?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    private var displayedComparison: VariationComparison? {
        if let trackedVariationId,
           let tracked = service.comparison(for: trackedVariationId) {
            return tracked
        }

        return service.latestComparison(matchingPrompt: enhancedPrompt)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Strategy chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(VariationStrategy.allCases) { strategy in
                        strategyChip(strategy)
                    }
                }
                .padding(.vertical, 8)
            }
            .scrollClipDisabled()

            Button {
                Task { await generateVariations() }
            } label: {
                HStack(spacing: 8) {
                    if service.isLoading || displayedComparison?.isPending == true {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .scaleEffect(0.8)
                            .tint(.white)
                    } else {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                    }

                    Text(displayedComparison?.isPending == true ? "Generating in Background..." : "Generate Variations")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(.white)
            }
            .buttonStyle(LiquidGlassButtonStyle(
                cornerRadius: 12,
                tintColor: colorScheme == .dark ? accentColor : Color.brandPurple,
                intensity: .prominent
            ))
            .disabled(service.isLoading || displayedComparison?.isPending == true)

            if let failedMessage = displayedComparison?.errorMessage,
               displayedComparison?.status == .failed {
                inlineMessage(
                    icon: "exclamationmark.triangle.fill",
                    color: .orange,
                    text: failedMessage
                )
            } else if let localError {
                inlineMessage(
                    icon: "exclamationmark.triangle.fill",
                    color: .orange,
                    text: localError
                )
            }

            if let comparison = displayedComparison, comparison.isPending {
                inlineMessage(
                    icon: "clock.arrow.circlepath",
                    color: accentColor,
                    text: "Generation continues in the background. You can leave this screen or close the app."
                )
            }

            if let comparison = displayedComparison {
                variationResults(comparison)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.spring(response: 0.3), value: displayedComparison?.variationId)
        .task(id: enhancedPrompt) {
            if let comparison = await service.resumePendingGenerationIfNeeded(for: enhancedPrompt) {
                trackedVariationId = comparison.variationId
            }
        }
    }

    // MARK: - Strategy Chip

    private func strategyChip(_ strategy: VariationStrategy) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                selectedStrategy = strategy
                trackedVariationId = nil
                localError = nil
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: strategy.icon)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(selectedStrategy == strategy ? .white : textSecondary)
                Text(strategy.displayName)
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(selectedStrategy == strategy ? .white : textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .liquidGlassChip(isSelected: selectedStrategy == strategy, accentColor: accentColor)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Messages

    private func inlineMessage(icon: String, color: Color, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(text)
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(textSecondary)
        }
        .transition(.opacity)
    }

    // MARK: - Variation Results

    private func variationResults(_ comparison: VariationComparison) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if !comparison.results.isEmpty {
                HStack(spacing: 12) {
                    metricBadge(
                        icon: "number",
                        text: "\(comparison.results.count) variations",
                        color: accentColor
                    )
                    metricBadge(
                        icon: "chart.bar.fill",
                        text: String(format: "%.0f avg tokens", comparison.metrics.averageTokens),
                        color: .purple
                    )
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(comparison.results) { variation in
                            variationCard(variation)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .scrollClipDisabled()
            }

            Button {
                onOpenSheet()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 12, weight: .semibold))
                    Text("Open Full View")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                }
                .foregroundStyle(textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
            .buttonStyle(GlassCapsuleButtonStyle())
        }
    }

    // MARK: - Variation Card

    private func variationCard(_ variation: VariationResultItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(variation.label)
                    .font(.system(.caption2, design: .rounded, weight: .bold))
                    .foregroundStyle(accentColor)

                Text(variation.mode.uppercased())
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(textSecondary)

                Spacer()

                Text("\(variation.tokensUsed) tok")
                    .font(.system(.caption2, design: .rounded, weight: .medium))
                    .foregroundStyle(textTertiary)
            }

            Text(variation.enhancedPrompt)
                .font(.system(.caption, design: .default))
                .foregroundStyle(textPrimary)
                .lineLimit(4)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            Button {
                onApplyPrompt(variation.enhancedPrompt)
            } label: {
                Text("Use This")
                    .font(.system(.caption2, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(GlassCapsuleButtonStyle(
                tintColor: colorScheme == .dark ? accentColor : Color.brandPurple
            ))
        }
        .padding(12)
        .frame(width: 180, height: 180)
        .liquidGlass(cornerRadius: 12)
    }

    // MARK: - Metric Badge

    private func metricBadge(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
            Text(text)
                .font(.system(.caption2, design: .rounded, weight: .semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.12))
        .clipShape(Capsule())
    }

    // MARK: - Generate

    private func generateVariations() async {
        localError = nil

        do {
            let result = try await service.generateVariations(
                prompt: enhancedPrompt,
                strategy: selectedStrategy
            )
            trackedVariationId = result.variationId
        } catch {
            localError = error.localizedDescription
        }
    }
}
