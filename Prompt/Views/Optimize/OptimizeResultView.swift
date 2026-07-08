//
//  OptimizeResultView.swift
//  Prompt
//
//  Terminal outcome of a reflection-loop optimization. The optimized variant
//  renders the honest before/after comparison (spec §4 P6 / §6): score delta,
//  the receipts (same test run on both prompts), prompt diff with highlighted
//  {{variable}} slots, per-criterion rubric breakdown, and template actions.
//

import SwiftUI
import UIKit

struct OptimizeResultView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    let outcome: OptimizeOutcome
    let viewModel: OptimizeViewModel
    let onDone: () -> Void

    private enum ReceiptSide: String, CaseIterable, Identifiable {
        case original
        case winner

        var id: String { rawValue }

        var title: String {
            switch self {
            case .original: return "Before"
            case .winner: return "After"
            }
        }
    }

    @State private var selectedReceiptSide: ReceiptSide = .winner
    @State private var expandedCriterion: String?
    @State private var showCopied = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private var isRegularWidth: Bool { horizontalSizeClass == .regular }

    var body: some View {
        switch outcome {
        case .refused(let refused):
            refusedCard(refused)
        case .fastPath(let fastPath):
            fastPathCard(fastPath)
        case .optimized(let optimized):
            optimizedContent(optimized)
        }
    }

    // MARK: - Refused

    private func refusedCard(_ refused: OptimizeOutcome.Refused) -> some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(Color.orange.opacity(0.15))
                    .frame(width: 84, height: 84)

                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundStyle(.orange)
            }
            .padding(.top, 8)

            VStack(spacing: 8) {
                Text("Can't optimize this one")
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text(refused.message)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }

            doneButton
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .liquidGlass(cornerRadius: 16)
    }

    // MARK: - Fast Path

    private func fastPathCard(_ fastPath: OptimizeOutcome.FastPath) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("Enhanced Prompt", systemImage: "sparkles")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Spacer()
            }

            promptSurface {
                Text(fastPath.enhancedPrompt)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Text(fastPathFootnote(for: fastPath.reason))
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(textTertiary)
                .fixedSize(horizontal: false, vertical: true)

            copyButton(text: fastPath.enhancedPrompt)

            HStack(spacing: 8) {
                shareButton(text: fastPath.enhancedPrompt)
                doneUtilityButton
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 16)
    }

    private func fastPathFootnote(for reason: OptimizeOutcome.FastPath.Reason) -> String {
        switch reason {
        case .freeTier:
            return "Single-pass polish on the Free plan. Upgrade to run the full optimization loop with test runs and receipts."
        case .alreadyStrong:
            return "Your prompt was already strong — a light polish was all it needed."
        case .stageDegraded:
            return "The full loop wasn't available just now, so we applied a single-pass polish instead."
        }
    }

    // MARK: - Optimized

    private func optimizedContent(_ optimized: OptimizeOutcome.Optimized) -> some View {
        VStack(spacing: 20) {
            scoreHeaderCard(optimized)

            if !optimized.summaryBullets.isEmpty {
                summaryCard(optimized)
            }

            receiptsCard(optimized)
            promptComparisonCard(optimized)
            rubricCard(optimized)
            actionsSection(optimized)
        }
    }

    // MARK: Score Header

    private func scoreHeaderCard(_ optimized: OptimizeOutcome.Optimized) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(optimized.title)
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 10) {
                scoreDeltaChip(optimized)
                Spacer(minLength: 0)
                targetFamilyChip(optimized.requestedTargetModelFamily)
            }

            if optimized.originalWon {
                originalWonBanner
            }

            Text("\(optimized.rolloutsUsed) test \(optimized.rolloutsUsed == 1 ? "run" : "runs") · \(stopReasonLabel(optimized.stopReason))")
                .font(.system(.caption2, design: .rounded, weight: .medium))
                .foregroundStyle(textTertiary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlass(cornerRadius: 16, borderGlow: true)
    }

    private func scoreDeltaChip(_ optimized: OptimizeOutcome.Optimized) -> some View {
        let improved = optimized.scoreDelta > 0.05
        let chipColor: Color = improved ? .green : textSecondary

        return HStack(spacing: 6) {
            Text(formatScore(optimized.original.score))
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)

            Image(systemName: "arrow.right")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(chipColor)

            Text(formatScore(optimized.winner.score))
                .font(.system(.subheadline, design: .rounded, weight: .bold))
                .foregroundStyle(improved ? .green : textPrimary)

            if improved {
                Text("+\(formatScore(optimized.scoreDelta))")
                    .font(.system(.caption2, design: .rounded, weight: .bold))
                    .foregroundStyle(.green)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.green.opacity(0.15))
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(chipColor.opacity(0.12))
        .clipShape(Capsule())
        .accessibilityLabel("Score improved from \(formatScore(optimized.original.score)) to \(formatScore(optimized.winner.score)) out of 5")
    }

    private func targetFamilyChip(_ family: TargetModelFamily) -> some View {
        HStack(spacing: 4) {
            Image(systemName: family.sfSymbol)
                .font(.system(size: 10, weight: .semibold))
            Text(family == .unknown ? "Auto profile" : family.displayName)
                .font(.system(.caption2, design: .rounded, weight: .semibold))
        }
        .foregroundStyle(textSecondary)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .liquidGlassChip(isSelected: false)
    }

    /// Spec §6: honesty is a retention feature — when no candidate beat the
    /// untouched original, say so plainly.
    private var originalWonBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.orange)

            VStack(alignment: .leading, spacing: 2) {
                Text("Your original prompt won")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)

                Text("None of our candidates beat it in testing, so we kept yours.")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.orange.opacity(colorScheme == .dark ? 0.14 : 0.10))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.orange.opacity(0.35), lineWidth: 1)
        }
    }

    private func stopReasonLabel(_ reason: OptimizeStopReason) -> String {
        switch reason {
        case .targetReached: return "target score reached"
        case .plateau: return "scores plateaued"
        case .budgetExhausted: return "test budget used"
        }
    }

    // MARK: Summary

    private func summaryCard(_ optimized: OptimizeOutcome.Optimized) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LiquidGlassSectionHeader(title: "What Changed", icon: "list.bullet.rectangle")

            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(optimized.summaryBullets.enumerated()), id: \.offset) { _, bullet in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "sparkle")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(accentColor)
                            .padding(.top, 4)

                        Text(bullet)
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: 16)
        }
    }

    // MARK: Receipts (rollout outputs)

    private func receiptsCard(_ optimized: OptimizeOutcome.Optimized) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LiquidGlassSectionHeader(
                title: "The Receipts",
                icon: "doc.text.magnifyingglass",
                trailing: AnyView(
                    Text("Same test run on both prompts")
                        .font(.system(.caption2, design: .rounded, weight: .medium))
                        .foregroundStyle(textTertiary)
                )
            )

            if isRegularWidth {
                HStack(alignment: .top, spacing: 12) {
                    rolloutBox(
                        title: "Before · Original",
                        score: optimized.original.score,
                        text: optimized.original.rolloutOutput,
                        isWinner: false
                    )
                    rolloutBox(
                        title: "After · Winner",
                        score: optimized.winner.score,
                        text: optimized.winner.rolloutOutput,
                        isWinner: true
                    )
                }
            } else {
                VStack(spacing: 10) {
                    receiptSegmentPicker

                    switch selectedReceiptSide {
                    case .original:
                        rolloutBox(
                            title: "Before · Original",
                            score: optimized.original.score,
                            text: optimized.original.rolloutOutput,
                            isWinner: false
                        )
                    case .winner:
                        rolloutBox(
                            title: "After · Winner",
                            score: optimized.winner.score,
                            text: optimized.winner.rolloutOutput,
                            isWinner: true
                        )
                    }
                }
            }
        }
    }

    private var receiptSegmentPicker: some View {
        HStack(spacing: 8) {
            ForEach(ReceiptSide.allCases) { side in
                let isSelected = selectedReceiptSide == side

                Button {
                    triggerHaptic(.light)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedReceiptSide = side
                    }
                } label: {
                    Text(side.title)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(isSelected ? .white : textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .liquidGlassChip(isSelected: isSelected, accentColor: accentColor)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 2)
    }

    private func rolloutBox(title: String, score: Double, text: String, isWinner: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(textSecondary)

                Spacer()

                Text("\(formatScore(score)) / 5")
                    .font(.system(.caption2, design: .rounded, weight: .bold))
                    .foregroundStyle(isWinner ? accentColor : textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background((isWinner ? accentColor : textSecondary).opacity(0.12))
                    .clipShape(Capsule())
            }

            ScrollView {
                Text(text)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 140, maxHeight: 240)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill((isWinner ? accentColor : Color.white).opacity(colorScheme == .dark ? 0.06 : 0.04))
                }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(
                    isWinner
                        ? accentColor.opacity(0.45)
                        : Color.white.opacity(colorScheme == .dark ? 0.12 : 0.5),
                    lineWidth: isWinner ? 1.5 : 1
                )
        }
    }

    // MARK: Prompt Comparison

    private func promptComparisonCard(_ optimized: OptimizeOutcome.Optimized) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LiquidGlassSectionHeader(title: "Prompt Comparison", icon: "arrow.left.arrow.right")

            if isRegularWidth {
                HStack(alignment: .top, spacing: 12) {
                    promptBox(title: "Original", text: optimized.original.promptText, isWinner: false)
                    promptBox(title: "Optimized", text: optimized.winner.promptText, isWinner: true)
                }
            } else {
                VStack(spacing: 10) {
                    promptBox(title: "Original", text: optimized.original.promptText, isWinner: false)
                    promptBox(title: "Optimized", text: optimized.winner.promptText, isWinner: true)
                }
            }

            if !optimized.variables.isEmpty {
                variableChips(optimized.variables)
            }
        }
    }

    private func promptBox(title: String, text: String, isWinner: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(isWinner ? accentColor : textSecondary)

            ScrollView {
                Text(highlightVariables(in: text))
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 90, maxHeight: 200)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(
                    isWinner
                        ? accentColor.opacity(0.45)
                        : Color.white.opacity(colorScheme == .dark ? 0.12 : 0.5),
                    lineWidth: isWinner ? 1.5 : 1
                )
        }
    }

    private func variableChips(_ variables: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Text("Variables")
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(textTertiary)

                ForEach(variables, id: \.self) { variable in
                    Text("{{\(variable)}}")
                        .font(.system(.caption2, design: .monospaced, weight: .semibold))
                        .foregroundStyle(accentColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(accentColor.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 2)
        }
    }

    /// Tints `{{variable}}` slots so template slots pop out of the monospaced
    /// prompt text.
    private func highlightVariables(in text: String) -> AttributedString {
        var result = AttributedString()
        var cursor = text.startIndex

        for match in text.matches(of: /\{\{[A-Za-z0-9_]+\}\}/) {
            if cursor < match.range.lowerBound {
                result += AttributedString(String(text[cursor..<match.range.lowerBound]))
            }

            var slot = AttributedString(String(text[match.range]))
            slot.foregroundColor = accentColor
            slot.backgroundColor = accentColor.opacity(0.14)
            result += slot

            cursor = match.range.upperBound
        }

        if cursor < text.endIndex {
            result += AttributedString(String(text[cursor...]))
        }

        return result
    }

    // MARK: Rubric Breakdown

    private func rubricCard(_ optimized: OptimizeOutcome.Optimized) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LiquidGlassSectionHeader(title: "Rubric Breakdown", icon: "chart.bar.xaxis")

            VStack(spacing: 0) {
                ForEach(optimized.receiptPairs) { pair in
                    criterionRow(pair)

                    if pair.id != optimized.receiptPairs.last?.id {
                        LiquidGlassDivider()
                            .padding(.horizontal, 4)
                    }
                }
            }
            .padding(.vertical, 4)
            .liquidGlass(cornerRadius: 16)
        }
    }

    private func criterionRow(_ pair: OptimizeReceiptPair) -> some View {
        let isExpanded = expandedCriterion == pair.criterion
        let hasEvidence = pair.originalEvidence != nil || pair.winnerEvidence != nil

        return VStack(alignment: .leading, spacing: 10) {
            Button {
                guard hasEvidence else { return }
                triggerHaptic(.light)
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    expandedCriterion = isExpanded ? nil : pair.criterion
                }
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Text(displayCriterionName(pair.criterion))
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(textPrimary)
                            .lineLimit(1)

                        Spacer(minLength: 8)

                        scorePairLabel(pair)

                        if hasEvidence {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(textTertiary)
                                .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        }
                    }

                    scoreBars(pair)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    if let evidence = pair.originalEvidence, !evidence.isEmpty {
                        evidenceLine(label: "Before", text: evidence, tint: textSecondary)
                    }
                    if let evidence = pair.winnerEvidence, !evidence.isEmpty {
                        evidenceLine(label: "After", text: evidence, tint: accentColor)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func scorePairLabel(_ pair: OptimizeReceiptPair) -> some View {
        HStack(spacing: 4) {
            Text(pair.originalScore.map(String.init) ?? "–")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)

            Image(systemName: "arrow.right")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(textTertiary)

            Text(pair.winnerScore.map(String.init) ?? "–")
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(deltaColor(pair.delta))
        }
    }

    private func scoreBars(_ pair: OptimizeReceiptPair) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            scoreBar(score: pair.originalScore, tint: textSecondary.opacity(0.55))
            scoreBar(score: pair.winnerScore, tint: accentColor)
        }
    }

    private func scoreBar(score: Int?, tint: Color) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.adaptiveBackgroundTertiary.opacity(0.6))

                if let score {
                    Capsule()
                        .fill(tint)
                        .frame(width: proxy.size.width * CGFloat(min(max(score, 0), 5)) / 5)
                }
            }
        }
        .frame(height: 5)
    }

    private func evidenceLine(label: String, text: String, tint: Color) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(label)
                .font(.system(.caption2, design: .rounded, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 44, alignment: .leading)

            Text("\u{201C}\(text)\u{201D}")
                .font(.system(.caption, design: .rounded))
                .italic()
                .foregroundStyle(textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func deltaColor(_ delta: Int?) -> Color {
        guard let delta else { return textPrimary }
        if delta > 0 { return .green }
        if delta < 0 { return .orange }
        return textPrimary
    }

    private func displayCriterionName(_ criterion: String) -> String {
        criterion.replacingOccurrences(of: "_", with: " ").capitalized
    }

    // MARK: Actions

    private func actionsSection(_ optimized: OptimizeOutcome.Optimized) -> some View {
        VStack(spacing: 12) {
            copyButton(text: optimized.templateText)

            HStack(spacing: 8) {
                saveTemplateButton
                shareButton(text: optimized.templateText)
                doneUtilityButton
            }

            if case .failed(let message) = viewModel.templateSaveState {
                Text(message)
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func copyButton(text: String) -> some View {
        Button {
            UIPasteboard.general.string = text
            triggerHaptic(.medium)
            withAnimation(.spring(response: 0.3)) {
                showCopied = true
            }
            Task {
                try? await Task.sleep(for: .seconds(1.5))
                withAnimation(.easeOut(duration: 0.2)) {
                    showCopied = false
                }
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: showCopied ? "checkmark" : "doc.on.doc.fill")
                    .font(.system(size: 16, weight: .semibold))
                Text(showCopied ? "Copied" : "Copy Prompt")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(colorScheme == .dark ? .black : .white)
            .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(LiquidGlassButtonStyle(
            cornerRadius: 12,
            tintColor: accentColor,
            intensity: .prominent
        ))
    }

    private var saveTemplateButton: some View {
        Button {
            triggerHaptic(.light)
            Task {
                await viewModel.saveWinnerAsTemplate()
            }
        } label: {
            HStack(spacing: 5) {
                switch viewModel.templateSaveState {
                case .idle, .failed:
                    Image(systemName: "square.and.arrow.down")
                        .font(.system(size: 13, weight: .medium))
                    Text("Save Template")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                case .saving:
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Saving…")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                case .saved:
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.green)
                    Text("Saved")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .foregroundStyle(textSecondary)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))
        .disabled(viewModel.templateSaveState == .saving || viewModel.templateSaveState == .saved)
    }

    private func shareButton(text: String) -> some View {
        ShareLink(item: text) {
            HStack(spacing: 5) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 13, weight: .medium))
                Text("Share")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .foregroundStyle(textSecondary)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))
    }

    private var doneUtilityButton: some View {
        Button {
            triggerHaptic(.light)
            onDone()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 13, weight: .medium))
                Text("Done")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .foregroundStyle(textSecondary)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))
    }

    private var doneButton: some View {
        Button {
            triggerHaptic(.light)
            onDone()
        } label: {
            Text("Done")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 12))
    }

    // MARK: - Shared Surfaces

    private func promptSurface(@ViewBuilder content: () -> some View) -> some View {
        ScrollView {
            content()
        }
        .frame(minHeight: 160, maxHeight: 280)
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(accentColor.opacity(colorScheme == .dark ? 0.08 : 0.05))
                }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(
                    LinearGradient(
                        colors: [
                            accentColor.opacity(0.5),
                            accentColor.opacity(0.2),
                            accentColor.opacity(0.3)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1.5
                )
        }
    }

    private func formatScore(_ score: Double) -> String {
        String(format: "%.1f", score)
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}
