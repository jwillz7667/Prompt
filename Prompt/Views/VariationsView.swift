import SwiftUI
import UIKit

struct VariationsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var service = VariationsService.shared

    let promptText: String

    @State private var selectedStrategy: VariationStrategy = .quick
    @State private var ratings: [Int: Int] = [:]
    @State private var expandedIndex: Int?
    @State private var showCopied = false
    @State private var copiedIndex: Int?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                if promptText.isEmpty {
                    emptyPromptView
                } else {
                    ScrollView {
                        VStack(spacing: 20) {
                            originalPromptCard
                            strategySelector
                            generateButton
                            resultsSection
                        }
                        .padding(20)
                        .padding(.bottom, 100)
                    }
                }
            }
            .navigationTitle("Variations")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
            }
        }
    }

    // MARK: - Original Prompt

    private var originalPromptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Original Prompt")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)
            Text(promptText)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textPrimary)
                .lineLimit(3)
                .textSelection(.enabled)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlass(cornerRadius: 16)
    }

    // MARK: - Strategy Selector

    private var strategySelector: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Strategy")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(VariationStrategy.allCases) { strategy in
                        Button {
                            triggerHaptic()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                selectedStrategy = strategy
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: strategy.icon)
                                    .font(.system(size: 12, weight: .semibold))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(strategy.displayName)
                                        .font(.system(.caption, design: .rounded, weight: .semibold))
                                    Text(strategy.description)
                                        .font(.system(.caption2, design: .rounded))
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .liquidGlassChip(isSelected: selectedStrategy == strategy, accentColor: accentColor)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Generate Button

    private var generateButton: some View {
        Button {
            Task { await generate() }
        } label: {
            if service.isLoading {
                HStack(spacing: 8) {
                    ProgressView().tint(.white)
                    Text("Generating Variations...")
                }
            } else {
                Label("Generate Variations", systemImage: "rectangle.on.rectangle")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
        }
        .buttonStyle(GlassPrimaryButtonStyle())
        .disabled(service.isLoading)
    }

    // MARK: - Results

    @ViewBuilder
    private var resultsSection: some View {
        if let comparison = service.currentComparison {
            VStack(spacing: 16) {
                metricsCard(comparison.metrics)

                ForEach(comparison.results) { result in
                    variationCard(
                        result: result,
                        isWinner: comparison.winner == result.index,
                        variationId: comparison.variationId
                    )
                }
            }
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
    }

    // MARK: - Metrics Card

    private func metricsCard(_ metrics: VariationMetrics) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Metrics")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)

            HStack(spacing: 16) {
                VStack(spacing: 4) {
                    Text("\(Int(metrics.averageTokens))")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(accentColor)
                    Text("Avg Tokens")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 4) {
                    Text("\(metrics.tokenRange.min)-\(metrics.tokenRange.max)")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)
                    Text("Token Range")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
                .frame(maxWidth: .infinity)
            }

            // Diversity score
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Diversity Score")
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                    Spacer()
                    Text("\(Int(metrics.diversityScore * 100))%")
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(accentColor)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(textTertiary.opacity(0.2))

                        RoundedRectangle(cornerRadius: 4)
                            .fill(
                                LinearGradient(
                                    colors: [accentColor, accentColor.opacity(0.6)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: geo.size.width * min(metrics.diversityScore, 1.0))
                    }
                }
                .frame(height: 6)
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 16)
    }

    // MARK: - Variation Card

    private func variationCard(result: VariationResultItem, isWinner: Bool, variationId: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack {
                Text("#\(result.index + 1)")
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(accentColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(accentColor.opacity(0.15))
                    .clipShape(Capsule())

                // Tone badge
                Text(result.tone.capitalized)
                    .font(.system(.caption2, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(accentColor.opacity(0.08))
                    .clipShape(Capsule())

                // Length badge
                Text(result.length.capitalized)
                    .font(.system(.caption2, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(accentColor.opacity(0.08))
                    .clipShape(Capsule())

                Spacer()

                if isWinner {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(accentColor)
                }
            }

            // Prompt text
            VStack(alignment: .leading, spacing: 4) {
                Text(result.enhancedPrompt)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(textPrimary)
                    .lineLimit(expandedIndex == result.index ? nil : 4)
                    .textSelection(.enabled)

                if result.enhancedPrompt.count > 200 {
                    Button {
                        withAnimation(.spring(response: 0.3)) {
                            expandedIndex = expandedIndex == result.index ? nil : result.index
                        }
                    } label: {
                        Text(expandedIndex == result.index ? "Show Less" : "Show More")
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(accentColor)
                    }
                }
            }

            // Stats & Actions
            HStack {
                Label("\(result.tokensUsed) tokens", systemImage: "number")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(textTertiary)

                Spacer()

                // Star rating
                starRating(index: result.index, variationId: variationId)

                // Copy
                Button {
                    triggerHaptic(.medium)
                    UIPasteboard.general.string = result.enhancedPrompt
                    copiedIndex = result.index
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        if copiedIndex == result.index { copiedIndex = nil }
                    }
                } label: {
                    Image(systemName: copiedIndex == result.index ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(copiedIndex == result.index ? (colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)) : textTertiary)
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
            }

            // Select as best
            if !isWinner {
                Button {
                    Task { await selectWinner(variationId: variationId, index: result.index) }
                } label: {
                    Label("Select as Best", systemImage: "star.fill")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                }
                .buttonStyle(GlassSecondaryButtonStyle())
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 16, borderGlow: isWinner)
    }

    // MARK: - Star Rating

    private func starRating(index: Int, variationId: String) -> some View {
        HStack(spacing: 6) {
            ForEach(1...5, id: \.self) { star in
                Button {
                    triggerHaptic()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        ratings[index] = star
                    }
                    Task {
                        try? await service.rateVariation(
                            variationId: variationId,
                            index: index,
                            rating: star
                        )
                    }
                } label: {
                    Image(systemName: (ratings[index] ?? 0) >= star ? "star.fill" : "star")
                        .font(.system(size: 12))
                        .foregroundStyle((ratings[index] ?? 0) >= star ? accentColor : textTertiary.opacity(0.5))
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Empty State

    private var emptyPromptView: some View {
        VStack(spacing: 20) {
            Image(systemName: "rectangle.on.rectangle")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(accentColor.opacity(0.6))

            Text("Enter a Prompt First")
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            Text("Go back and enter or enhance a prompt, then generate variations.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }

    // MARK: - Actions

    private func generate() async {
        do {
            _ = try await service.generateVariations(prompt: promptText, strategy: selectedStrategy)
        } catch {
            print("Failed to generate variations: \(error)")
        }
    }

    private func selectWinner(variationId: String, index: Int) async {
        do {
            try await service.selectWinner(variationId: variationId, winnerIndex: index)
        } catch {
            print("Failed to select winner: \(error)")
        }
    }
}
