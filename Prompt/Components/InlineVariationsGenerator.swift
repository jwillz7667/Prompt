//
//  InlineVariationsGenerator.swift
//  Prompt
//
//  Compact inline version of VariationsView for Power Tools section.
//

import SwiftUI

struct InlineVariationsGenerator: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(StoreKitManager.self) private var storeKit

    let enhancedPrompt: String
    let onApplyPrompt: (String) -> Void
    let onOpenSheet: () -> Void

    @State private var selectedStrategy: VariationStrategy = .quick
    @State private var isGenerating = false
    @State private var comparison: VariationComparison?
    @State private var error: String?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Strategy chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(VariationStrategy.allCases) { strategy in
                        strategyChip(strategy)
                    }
                }
            }

            // Generate button
            Button {
                Task { await generateVariations() }
            } label: {
                HStack(spacing: 8) {
                    if isGenerating {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .scaleEffect(0.8)
                            .tint(.white)
                    } else {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    Text("Generate Variations")
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
            .disabled(isGenerating)

            // Error
            if let error {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text(error)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(textSecondary)
                }
                .transition(.opacity)
            }

            // Results as horizontal scroll
            if let comparison {
                variationResults(comparison)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.spring(response: 0.3), value: comparison != nil)
    }

    // MARK: - Strategy Chip

    private func strategyChip(_ strategy: VariationStrategy) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                selectedStrategy = strategy
                comparison = nil
                error = nil
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

    // MARK: - Variation Results

    private func variationResults(_ comparison: VariationComparison) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Metrics summary
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

            // Horizontal scrolling variation cards
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(comparison.results) { variation in
                        variationCard(variation)
                    }
                }
            }

            // Open full view button
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
            // Header: tone + tokens
            HStack {
                Text(variation.tone.capitalized)
                    .font(.system(.caption2, design: .rounded, weight: .bold))
                    .foregroundStyle(accentColor)

                Spacer()

                Text("\(variation.tokensUsed) tok")
                    .font(.system(.caption2, design: .rounded, weight: .medium))
                    .foregroundStyle(textTertiary)
            }

            // Truncated text
            Text(variation.enhancedPrompt)
                .font(.system(.caption, design: .default))
                .foregroundStyle(textPrimary)
                .lineLimit(4)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            // Use This button
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
        isGenerating = true
        error = nil

        do {
            let result = try await VariationsService.shared.generateVariations(
                prompt: enhancedPrompt,
                strategy: selectedStrategy
            )
            self.comparison = result
        } catch {
            self.error = "Generation failed. Please try again."
        }

        isGenerating = false
    }
}
