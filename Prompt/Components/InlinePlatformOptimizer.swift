//
//  InlinePlatformOptimizer.swift
//  Prompt
//
//  Compact inline version of PlatformOptimizationView for Power Tools section.
//

import SwiftUI

struct InlinePlatformOptimizer: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(StoreKitManager.self) private var storeKit

    let enhancedPrompt: String
    let onApplyPrompt: (String) -> Void
    let onOpenSheet: () -> Void

    @State private var selectedPlatform: PlatformType?
    @State private var isOptimizing = false
    @State private var result: PlatformOptimizationResult?
    @State private var error: String?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Platform chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(PlatformType.allCases.filter { $0 != .custom }) { platform in
                        chipButton(for: platform)
                    }
                }
                .padding(.vertical, 8)
            }
            .scrollClipDisabled()

            // Validate & Optimize button
            if selectedPlatform != nil {
                Button {
                    Task { await optimizeForPlatform() }
                } label: {
                    HStack(spacing: 8) {
                        if isOptimizing {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .scaleEffect(0.8)
                                .tint(.white)
                        } else {
                            Image(systemName: "bolt.fill")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        Text("Validate & Optimize")
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
                .disabled(isOptimizing)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

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

            // Result
            if let result {
                resultView(result)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.spring(response: 0.3), value: selectedPlatform?.rawValue)
        .animation(.spring(response: 0.3), value: result != nil)
    }

    // MARK: - Chip Button

    private func chipButton(for platform: PlatformType) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                if selectedPlatform == platform {
                    selectedPlatform = nil
                } else {
                    selectedPlatform = platform
                    result = nil
                    error = nil
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: platform.icon)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(selectedPlatform == platform ? .white : Color(hex: platform.color))
                Text(platform.displayName)
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(selectedPlatform == platform ? .white : textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .liquidGlassChip(
                isSelected: selectedPlatform == platform,
                accentColor: Color(hex: platform.color)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Result View

    private func resultView(_ result: PlatformOptimizationResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Optimized text
            ScrollView {
                Text(result.optimizedPrompt)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 120)
            .padding(12)
            .background {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(accentColor.opacity(colorScheme == .dark ? 0.06 : 0.03))
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(accentColor.opacity(0.3), lineWidth: 1)
            }

            // Improvement stats
            HStack(spacing: 16) {
                if result.improvements.lengthReduction != 0 {
                    statBadge(
                        icon: "arrow.down.right",
                        text: "\(abs(result.improvements.lengthReduction))% \(result.improvements.lengthReduction > 0 ? "shorter" : "longer")",
                        color: result.improvements.lengthReduction > 0 ? .green : .orange
                    )
                }

                if result.improvements.validationIssuesResolved > 0 {
                    statBadge(
                        icon: "checkmark.circle.fill",
                        text: "\(result.improvements.validationIssuesResolved) issues fixed",
                        color: .green
                    )
                }

                if result.validation.isValid {
                    statBadge(icon: "checkmark.seal.fill", text: "Valid", color: .green)
                }
            }

            // Action buttons
            HStack(spacing: 8) {
                Button {
                    onApplyPrompt(result.optimizedPrompt)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Use This Prompt")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
                .buttonStyle(GlassCapsuleButtonStyle(
                    tintColor: colorScheme == .dark ? accentColor : Color.brandPurple
                ))

                Button {
                    onOpenSheet()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Open Full Studio")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                    }
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
                .buttonStyle(GlassCapsuleButtonStyle())
            }
        }
    }

    // MARK: - Stat Badge

    private func statBadge(icon: String, text: String, color: Color) -> some View {
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

    // MARK: - Optimize

    private func optimizeForPlatform() async {
        guard let platform = selectedPlatform else { return }

        isOptimizing = true
        error = nil

        do {
            let optimizationResult = try await PlatformService.shared.optimizePrompt(
                prompt: enhancedPrompt,
                platform: platform
            )
            self.result = optimizationResult
        } catch {
            self.error = "Optimization failed. Please try again."
        }

        isOptimizing = false
    }
}
