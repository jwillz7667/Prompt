//
//  PromptInputCard.swift
//  Prompt
//
//  Extracted from ContentView: input text editor + toolbar + transformation overlay.
//

import SwiftUI

struct PromptInputCard: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit

    @Binding var userPrompt: String
    var isTextEditorFocused: FocusState<Bool>.Binding
    let isTransforming: Bool
    let transformationPhaseText: String
    let onShowPaywall: () -> Void

    // Pulsing animation states
    @State private var pulsingScale: CGFloat = 1.0
    @State private var pulsingOpacity: Double = 0.7

    // Info popups
    @State private var showMaxModeInfo = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        ZStack {
            // Main input container with embedded toolbar
            VStack(spacing: 0) {
                // Text editor area
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $userPrompt)
                        .font(.system(.body, design: .default))
                        .foregroundStyle(textPrimary)
                        .frame(minHeight: 140, maxHeight: 260)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 8)
                        .scrollContentBackground(.hidden)
                        .focused(isTextEditorFocused)
                        .opacity(isTransforming ? 0.3 : 1.0)
                        .blur(radius: isTransforming ? 3 : 0)

                    if userPrompt.isEmpty && !isTransforming {
                        Text("Describe what you want to achieve...")
                            .font(.body)
                            .foregroundStyle(textTertiary)
                            .padding(.horizontal, 20)
                            .padding(.top, 24)
                            .allowsHitTesting(false)
                    }
                }

                // Embedded toolbar with controls
                inputToolbar
                    .opacity(isTransforming ? 0.3 : 1.0)
            }
            .liquidGlassInput(cornerRadius: 16, isFocused: isTextEditorFocused.wrappedValue)

            // Pulsing logo overlay during transformation
            if isTransforming {
                VStack(spacing: 16) {
                    Image("AppLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 80, height: 80)
                        .scaleEffect(pulsingScale)
                        .opacity(pulsingOpacity)
                        .onAppear {
                            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                                pulsingScale = 1.15
                                pulsingOpacity = 1.0
                            }
                        }
                        .onDisappear {
                            pulsingScale = 1.0
                            pulsingOpacity = 0.7
                        }

                    Text(transformationPhaseText)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                        .contentTransition(.numericText())
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(.ultraThinMaterial.opacity(0.8))
                )
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: isTransforming)
        .overlay(alignment: .top) {
            if showMaxModeInfo {
                maxModeInfoPopup
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .opacity
                    ))
                    .padding(.top, -50)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: showMaxModeInfo)
    }

    // MARK: - Input Toolbar

    private var inputToolbar: some View {
        HStack(spacing: 8) {
            CompactModalitySelector(
                selectedModality: Binding(
                    get: { settings.selectedModality },
                    set: { newValue in
                        settings.selectedModality = newValue
                        settings.savePreferences()
                    }
                )
            )

            if settings.selectedModality == .audio {
                CompactAudioSubModalitySelector(
                    selectedSubModality: Binding(
                        get: { settings.selectedAudioSubModality },
                        set: { newValue in
                            settings.selectedAudioSubModality = newValue
                            settings.savePreferences()
                        }
                    )
                )
                .transition(.scale.combined(with: .opacity))
            }

            Spacer()

            maxModeInlineToggle
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background {
            Rectangle()
                .fill(bgSecondary.opacity(0.5))
        }
        .animation(.spring(response: 0.3), value: settings.selectedModality)
    }

    // MARK: - MAX Mode

    private var maxModeRemaining: Int? {
        storeKit.usageInfo?.maxModeRemaining
    }

    private var canUseMaxMode: Bool {
        guard let remaining = maxModeRemaining else { return true }
        return remaining == -1 || remaining > 0
    }

    private var maxModeInlineToggle: some View {
        Button {
            if !settings.maxModeEnabled && !canUseMaxMode {
                if storeKit.currentTier == .free {
                    onShowPaywall()
                }
                return
            }
            withAnimation(.spring(response: 0.3)) {
                settings.maxModeEnabled.toggle()
                settings.savePreferences()
            }
            triggerHaptic(.light)
            if settings.maxModeEnabled {
                showMaxModeInfo = true
                Task {
                    try? await Task.sleep(for: .seconds(3))
                    withAnimation(.easeOut(duration: 0.3)) { showMaxModeInfo = false }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: settings.maxModeEnabled ? "flame.fill" : "flame")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(settings.maxModeEnabled ? .white : textSecondary)
                Text("MAX")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(settings.maxModeEnabled ? .white : textSecondary)
                if let remaining = maxModeRemaining,
                   remaining >= 0 {
                    Text("\(remaining)")
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .foregroundStyle(settings.maxModeEnabled ? .white.opacity(0.8) : textTertiary)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .buttonStyle(GlassCapsuleButtonStyle(
            tintColor: settings.maxModeEnabled ? .orange : nil,
            intensity: settings.maxModeEnabled ? .standard : .subtle
        ))
    }

    // MARK: - Info Popups

    private var maxModeInfoPopup: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.orange.opacity(0.2))
                    .frame(width: 36, height: 36)
                Image(systemName: "flame.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.orange)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("MAX MODE")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)
                Text("Uses the strongest prompt generation path with deeper planning and validation")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textSecondary)
            }
            Spacer()
            Button {
                withAnimation(.easeOut(duration: 0.2)) { showMaxModeInfo = false }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(textTertiary)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(GlassIconButtonStyle(size: 28))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [Color.orange.opacity(0.4), Color.orange.opacity(0.1)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
        }
        .shadow(color: Color.orange.opacity(0.2), radius: 20, y: 8)
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.1), radius: 10, y: 4)
        .padding(.horizontal, 20)
    }

    // MARK: - Helpers

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}
