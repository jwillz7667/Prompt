import SwiftUI
import UIKit

struct PlatformOptimizationView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var service = PlatformService.shared

    let promptText: String

    @State private var selectedPlatform: PlatformType?
    @State private var validation: PlatformValidation?
    @State private var optimization: PlatformOptimizationResult?
    @State private var costEstimate: CostEstimateResponse?
    @State private var isValidating = false
    @State private var isOptimizing = false
    @State private var isEstimating = false
    @State private var showCopied = false
    @State private var activeSection: PlatformSection = .platforms

    enum PlatformSection: String, CaseIterable {
        case platforms = "Platforms"
        case validate = "Validate"
        case optimize = "Optimize"
        case cost = "Cost"
    }

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
                            promptCard
                            sectionPicker
                            sectionContent
                        }
                        .padding(20)
                        .padding(.bottom, 100)
                    }
                }
            }
            .navigationTitle("Platform Optimization")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
            }
            .task { await service.loadPlatformsIfNeeded() }
        }
    }

    // MARK: - Prompt Card

    private var promptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Current Prompt")
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

    // MARK: - Section Picker

    private var sectionPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PlatformSection.allCases, id: \.self) { section in
                    Button {
                        triggerHaptic()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            activeSection = section
                        }
                    } label: {
                        Text(section.rawValue)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .liquidGlassChip(isSelected: activeSection == section, accentColor: accentColor)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Section Content

    @ViewBuilder
    private var sectionContent: some View {
        switch activeSection {
        case .platforms:
            platformGrid
        case .validate:
            validateSection
        case .optimize:
            optimizeSection
        case .cost:
            costSection
        }
    }

    // MARK: - Platform Grid

    private var platformGrid: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: 12),
            GridItem(.flexible(), spacing: 12)
        ], spacing: 12) {
            ForEach(PlatformType.storefrontAvailableCases) { platform in
                platformCard(platform)
            }
        }
    }

    private func platformCard(_ platform: PlatformType) -> some View {
        Button {
            triggerHaptic()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                selectedPlatform = platform
            }
        } label: {
            VStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(Color(hex: platform.color).opacity(0.2))
                        .frame(width: 44, height: 44)

                    Image(systemName: platform.icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Color(hex: platform.color))
                }

                Text(platform.displayName)
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(textPrimary)
                    .lineLimit(1)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .liquidGlass(
                cornerRadius: 16,
                borderGlow: selectedPlatform == platform
            )
            .overlay {
                if selectedPlatform == platform {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color(hex: platform.color).opacity(0.5), lineWidth: 2)
                }
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Validate Section

    private var validateSection: some View {
        VStack(spacing: 16) {
            if selectedPlatform == nil {
                selectPlatformPrompt
            } else {
                Button {
                    Task { await validatePrompt() }
                } label: {
                    if isValidating {
                        HStack {
                            ProgressView().tint(.white)
                            Text("Validating...")
                        }
                    } else {
                        Label("Validate for \(selectedPlatform!.displayName)", systemImage: "checkmark.shield")
                    }
                }
                .buttonStyle(GlassPrimaryButtonStyle())
                .disabled(isValidating)

                if let validation = validation {
                    validationResults(validation)
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                }
            }
        }
    }

    private func validationResults(_ validation: PlatformValidation) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Status
            HStack {
                Image(systemName: validation.isValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(validation.isValid ? .green : .red)
                Text(validation.isValid ? "Valid" : "Issues Found")
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(textPrimary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: 12)

            // Errors
            ForEach(validation.errors) { issue in
                issueRow(issue, isError: true)
            }

            // Warnings
            ForEach(validation.warnings) { issue in
                issueRow(issue, isError: false)
            }
        }
    }

    private func issueRow(_ issue: ValidationIssue, isError: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: isError ? "exclamationmark.triangle.fill" : "exclamationmark.circle.fill")
                .foregroundStyle(isError ? .red : .orange)
                .font(.system(size: 14))

            Text(issue.message)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textPrimary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill((isError ? Color.red : Color.orange).opacity(0.08))
        )
    }

    // MARK: - Optimize Section

    private var optimizeSection: some View {
        VStack(spacing: 16) {
            if selectedPlatform == nil {
                selectPlatformPrompt
            } else {
                Button {
                    Task { await optimizePrompt() }
                } label: {
                    if isOptimizing {
                        HStack {
                            ProgressView().tint(.white)
                            Text("Optimizing...")
                        }
                    } else {
                        Label("Optimize for \(selectedPlatform!.displayName)", systemImage: "wand.and.stars")
                    }
                }
                .buttonStyle(GlassPrimaryButtonStyle())
                .disabled(isOptimizing)

                if let result = optimization {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Optimized Prompt")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(textSecondary)

                        Text(result.optimizedPrompt)
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(textPrimary)
                            .textSelection(.enabled)
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .liquidGlass(cornerRadius: 14, borderGlow: true)

                        // Improvements
                        HStack(spacing: 16) {
                            improvementStat(
                                label: "Length Change",
                                value: "\(result.improvements.lengthReduction > 0 ? "-" : "+")\(abs(result.improvements.lengthReduction)) chars"
                            )
                            improvementStat(
                                label: "Issues Fixed",
                                value: "\(result.improvements.validationIssuesResolved)"
                            )
                        }

                        // Copy button
                        Button {
                            triggerHaptic(.medium)
                            UIPasteboard.general.string = result.optimizedPrompt
                            showCopied = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                showCopied = false
                            }
                        } label: {
                            Label(showCopied ? "Copied!" : "Copy Optimized Prompt", systemImage: showCopied ? "checkmark" : "doc.on.doc")
                        }
                        .buttonStyle(GlassSecondaryButtonStyle())
                    }
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
                }
            }
        }
    }

    private func improvementStat(label: String, value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(accentColor)
            Text(label)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(textTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .liquidGlass(cornerRadius: 10)
    }

    // MARK: - Cost Section

    private var costSection: some View {
        VStack(spacing: 16) {
            Button {
                Task { await estimateCosts() }
            } label: {
                if isEstimating {
                    HStack {
                        ProgressView().tint(.white)
                        Text("Estimating...")
                    }
                } else {
                    Label("Estimate Costs", systemImage: "dollarsign.circle")
                }
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(isEstimating)

            if let response = costEstimate {
                ForEach(response.estimates) { estimate in
                    costRow(estimate, isCheapest: estimate.platform == response.cheapest?.platform)
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }
        }
    }

    private func costRow(_ estimate: PlatformCostEstimate, isCheapest: Bool) -> some View {
        HStack {
            if let platformType = PlatformType(rawValue: estimate.platform) {
                Image(systemName: platformType.icon)
                    .foregroundStyle(Color(hex: platformType.color))
                    .frame(width: 24)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(estimate.platform)
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(textPrimary)
                Text("\(estimate.estimatedTokens) tokens")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textTertiary)
            }

            Spacer()

            Text("$\(estimate.estimatedCost, specifier: "%.4f")")
                .font(.system(.body, design: .rounded, weight: .bold))
                .foregroundStyle(isCheapest ? .green : textPrimary)

            if isCheapest {
                Image(systemName: "star.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.yellow)
            }
        }
        .padding(14)
        .liquidGlass(cornerRadius: 12, borderGlow: isCheapest)
    }

    // MARK: - Helper Views

    private var selectPlatformPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "cpu")
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(textTertiary)
            Text("Select a platform from the Platforms tab first")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(30)
    }

    private var emptyPromptView: some View {
        VStack(spacing: 20) {
            Image(systemName: "cpu")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(accentColor.opacity(0.6))

            Text("Enter a Prompt First")
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            Text("Go back and enter or enhance a prompt, then use platform optimization.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }

    // MARK: - Actions

    private func validatePrompt() async {
        guard let platform = selectedPlatform else { return }
        isValidating = true
        do {
            let result = try await service.validatePrompt(prompt: promptText, platform: platform)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                validation = result
            }
        } catch {
            print("Validation failed: \(error)")
        }
        isValidating = false
    }

    private func optimizePrompt() async {
        guard let platform = selectedPlatform else { return }
        isOptimizing = true
        do {
            let result = try await service.optimizePrompt(prompt: promptText, platform: platform)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                optimization = result
            }
        } catch {
            print("Optimization failed: \(error)")
        }
        isOptimizing = false
    }

    private func estimateCosts() async {
        isEstimating = true
        do {
            let result = try await service.estimateCost(
                prompt: promptText,
                platforms: PlatformType.storefrontSelectableCases
            )
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                costEstimate = result
            }
        } catch {
            print("Cost estimation failed: \(error)")
        }
        isEstimating = false
    }
}
