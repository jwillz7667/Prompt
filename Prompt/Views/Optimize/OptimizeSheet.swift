//
//  OptimizeSheet.swift
//  Prompt
//
//  Entry sheet for the reflection-loop optimizer (/api/v1/optimize):
//  setup (editable prompt, optional goal, target-model profile picker),
//  live stage progress driven by backend labels, and terminal outcomes.
//

import SwiftUI
import UIKit

struct OptimizeSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(GuestSessionManager.self) private var guestSession
    @Environment(AuthManager.self) private var authManager

    let viewModel: OptimizeViewModel

    @State private var promptText: String
    @State private var goalText = ""
    @State private var selectedFamily: TargetModelFamily = .unknown
    @State private var showPaywall = false
    @FocusState private var focusedField: Field?

    private enum Field {
        case prompt
        case goal
    }

    init(initialPrompt: String, viewModel: OptimizeViewModel) {
        self.viewModel = viewModel
        _promptText = State(initialValue: initialPrompt)
    }

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private var trimmedPrompt: String {
        promptText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Auto first, then the named families — mirrors spec §8: Free gets the
    /// single generic profile, Pro unlocks every named family.
    private var familyOptions: [TargetModelFamily] {
        [.unknown] + TargetModelFamily.allCases.filter { $0 != .unknown }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 20) {
                        PromptPageHeader(
                            title: "Optimize",
                            subtitle: "Test-driven optimization with honest receipts",
                            onLeadingTap: { dismiss() }
                        )
                        .padding(.top, 12)

                        stateContent
                    }
                    .padding(20)
                    .padding(.bottom, 60)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            viewModel.prepareForNewRun()
        }
        .sheet(isPresented: $showPaywall) {
            PaywallView()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
        }
    }

    // MARK: - State Routing

    @ViewBuilder
    private var stateContent: some View {
        switch viewModel.state {
        case .idle:
            setupSection
        case .submitting, .running:
            progressSection
        case .completed(let outcome):
            OptimizeResultView(
                outcome: outcome,
                viewModel: viewModel,
                onDone: { dismiss() }
            )
        case .failed(let message, let isRetryable):
            failureSection(message: message, isRetryable: isRetryable)
        case .featureDisabled:
            unavailableSection
        case .upgradeRequired:
            upgradeSection
        }
    }

    // MARK: - Setup

    private var setupSection: some View {
        VStack(spacing: 20) {
            promptEditorCard
            goalCard
            familyPickerCard
            startButton

            Text("Runs several candidate prompts through the same test, scores them against a rubric, and shows you the receipts. Takes about 30 seconds.")
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(textTertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
        }
    }

    private var promptEditorCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            LiquidGlassSectionHeader(title: "Your Prompt", icon: "text.alignleft")

            TextField("Paste the prompt to optimize...", text: $promptText, axis: .vertical)
                .font(.system(.subheadline, design: .monospaced))
                .foregroundStyle(textPrimary)
                .lineLimit(4...10)
                .textFieldStyle(.plain)
                .focused($focusedField, equals: .prompt)
                .padding(14)
                .liquidGlassInput(cornerRadius: 16, isFocused: focusedField == .prompt)
        }
    }

    private var goalCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            LiquidGlassSectionHeader(
                title: "Goal",
                icon: "target",
                trailing: AnyView(
                    Text("Optional")
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(textTertiary)
                )
            )

            TextField("What should the output achieve?", text: $goalText, axis: .vertical)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textPrimary)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .focused($focusedField, equals: .goal)
                .padding(14)
                .liquidGlassInput(cornerRadius: 16, isFocused: focusedField == .goal)
        }
    }

    private var familyPickerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            LiquidGlassSectionHeader(title: "Target Model Profile", icon: "cpu")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(familyOptions) { family in
                        familyChip(family)
                    }
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 6)
            }

            Text("The winning prompt is formatted for the model family you pick. Auto infers it from your prompt.")
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(textTertiary)
        }
    }

    private func familyChip(_ family: TargetModelFamily) -> some View {
        let isSelected = selectedFamily == family
        // Same tier read as the MAX-mode gating UI (ThreadView.maxModeCard).
        let isLocked = family.isProOnly && !storeKit.hasActiveSubscription

        return Button {
            triggerHaptic(.light)
            if isLocked {
                showPaywall = true
            } else {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    selectedFamily = family
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: family.sfSymbol)
                    .font(.system(size: 12, weight: .semibold))

                Text(family.displayName)
                    .font(.system(.caption, design: .rounded, weight: .semibold))

                if isLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 9, weight: .semibold))
                }
            }
            .foregroundStyle(isSelected ? .white : (isLocked ? textTertiary : textSecondary))
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .liquidGlassChip(isSelected: isSelected, accentColor: accentColor)
        }
        .buttonStyle(.plain)
    }

    private var startButton: some View {
        Button {
            startOptimization()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "wand.and.rays")
                    .font(.system(size: 16, weight: .semibold))
                Text("Optimize Prompt")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(colorScheme == .dark ? .black : .white)
        }
        .buttonStyle(LiquidGlassButtonStyle(
            cornerRadius: 12,
            tintColor: accentColor,
            intensity: .prominent
        ))
        .disabled(trimmedPrompt.isEmpty)
        .opacity(trimmedPrompt.isEmpty ? 0.55 : 1)
    }

    private func startOptimization() {
        triggerHaptic(.medium)
        focusedField = nil

        let goal = goalText.trimmingCharacters(in: .whitespacesAndNewlines)
        viewModel.optimize(
            rawPrompt: trimmedPrompt,
            goal: goal.isEmpty ? nil : goal,
            // Omitted and 'unknown' are equivalent on the wire; omitting keeps
            // Free-tier requests clear of the target-model gate.
            targetModelFamily: selectedFamily == .unknown ? nil : selectedFamily
        )
    }

    // MARK: - Progress

    private var progressSection: some View {
        VStack(spacing: 28) {
            LogoEnhancementAnimation(size: 120)
                .padding(.top, 24)

            VStack(spacing: 12) {
                // Backend stage copy verbatim ("Testing candidates…").
                Text(viewModel.stageLabel ?? "Starting optimization…")
                    .font(.system(.body, design: .rounded, weight: .medium))
                    .foregroundStyle(textPrimary)
                    .multilineTextAlignment(.center)
                    .contentTransition(.opacity)
                    .animation(.easeInOut(duration: 0.25), value: viewModel.stageLabel)

                ProgressView(value: viewModel.progressFraction)
                    .progressViewStyle(.linear)
                    .tint(accentColor)
                    .frame(maxWidth: 240)
                    .animation(.easeInOut(duration: 0.4), value: viewModel.progressFraction)

                if viewModel.rolloutsUsed > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "checklist.checked")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(accentColor)
                        Text("\(viewModel.rolloutsUsed) test \(viewModel.rolloutsUsed == 1 ? "run" : "runs")")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(textSecondary)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(accentColor.opacity(0.15))
                    .clipShape(Capsule())
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.rolloutsUsed)

            Button {
                triggerHaptic(.light)
                viewModel.cancel()
                dismiss()
            } label: {
                Text("Cancel")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 11)
            }
            .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 12))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    // MARK: - Failure

    @ViewBuilder
    private func failureSection(message: String, isRetryable: Bool) -> some View {
        if authManager.isSessionExpired {
            sessionExpiredSection
        } else {
            statusCard(
                icon: "exclamationmark.triangle.fill",
                iconColor: .orange,
                title: "Optimization failed",
                message: message
            ) {
                if isRetryable {
                    Button {
                        startOptimization()
                    } label: {
                        Label("Try Again", systemImage: "arrow.clockwise")
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .foregroundStyle(colorScheme == .dark ? .black : .white)
                    }
                    .buttonStyle(LiquidGlassButtonStyle(
                        cornerRadius: 12,
                        tintColor: accentColor,
                        intensity: .prominent
                    ))
                }

                closeButton
            }
        }
    }

    private var sessionExpiredSection: some View {
        statusCard(
            icon: "person.crop.circle.badge.exclamationmark",
            iconColor: accentColor,
            title: "Session expired",
            message: "This device's sign-in has lapsed. Sign in again to keep optimizing."
        ) {
            Button {
                triggerHaptic(.light)
                guestSession.presentAuthenticationGate()
                dismiss()
            } label: {
                Label("Sign In with Apple", systemImage: "apple.logo")
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .foregroundStyle(colorScheme == .dark ? .black : .white)
            }
            .buttonStyle(LiquidGlassButtonStyle(
                cornerRadius: 12,
                tintColor: accentColor,
                intensity: .prominent
            ))
        }
    }

    // MARK: - Feature Disabled / Upgrade

    private var unavailableSection: some View {
        statusCard(
            icon: "hourglass",
            iconColor: textSecondary,
            title: "Not available yet",
            message: "Prompt optimization isn't available yet. Check back soon."
        ) {
            closeButton
        }
    }

    private var upgradeSection: some View {
        statusCard(
            icon: "crown.fill",
            iconColor: .yellow,
            title: "Upgrade to keep optimizing",
            message: "The full optimization loop — candidates, test runs, and receipts — requires Pro or Premium."
        ) {
            Button {
                triggerHaptic(.light)
                showPaywall = true
            } label: {
                Label("See Plans", systemImage: "sparkles")
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .foregroundStyle(colorScheme == .dark ? .black : .white)
            }
            .buttonStyle(LiquidGlassButtonStyle(
                cornerRadius: 12,
                tintColor: accentColor,
                intensity: .prominent
            ))

            closeButton
        }
    }

    // MARK: - Shared Pieces

    private func statusCard(
        icon: String,
        iconColor: Color,
        title: String,
        message: String,
        @ViewBuilder actions: () -> some View
    ) -> some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 84, height: 84)

                Image(systemName: icon)
                    .font(.system(size: 34, weight: .medium))
                    .foregroundStyle(iconColor)
            }
            .padding(.top, 8)

            VStack(spacing: 8) {
                Text(title)
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text(message)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }

            VStack(spacing: 10) {
                actions()
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .liquidGlass(cornerRadius: 16)
    }

    private var closeButton: some View {
        Button {
            triggerHaptic(.light)
            dismiss()
        } label: {
            Text("Close")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 12))
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}
