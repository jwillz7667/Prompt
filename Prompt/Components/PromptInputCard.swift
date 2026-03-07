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
    let selectedPlatform: PlatformType?
    let onShowPaywall: () -> Void

    // Pulsing animation states
    @State private var pulsingScale: CGFloat = 1.0
    @State private var pulsingOpacity: Double = 0.7

    // Info popups
    @State private var showDeepThinkInfo = false
    @State private var showMaxModeInfo = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { Color.brandCyan }

    private var isPremium: Bool {
        storeKit.currentTier == .premium || storeKit.currentTier == .pro
    }

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
            if showDeepThinkInfo {
                deepThinkInfoPopup
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .opacity
                    ))
                    .padding(.top, -50)
            }
        }
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
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: showDeepThinkInfo)
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
            .opacity(selectedPlatform?.locksModality == true ? 0.5 : 1.0)
            .disabled(selectedPlatform?.locksModality == true)

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

            CompactToneSelector(
                selectedTone: Binding(
                    get: { settings.selectedTone },
                    set: { newValue in
                        settings.selectedTone = newValue
                        settings.savePreferences()
                    }
                )
            )

            CompactLengthSelector(selectedLength: Binding(
                get: { settings.outputLength },
                set: { newValue in
                    settings.outputLength = newValue
                    settings.savePreferences()
                }
            ))

            Spacer()

            maxModeInlineToggle
            deepThinkInlineToggle
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

    private var maxModeLimit: Int {
        switch storeKit.currentTier {
        case .premium: return Int.max
        case .pro: return 5
        case .free: return 0
        }
    }

    private var maxModeUsedToday: Int {
        let defaults = UserDefaults(suiteName: "group.com.res.promptomizer")
        let today = formattedDate(Date())
        guard let stored = defaults?.dictionary(forKey: "maxModeUsage"),
              let date = stored["date"] as? String,
              date == today,
              let count = stored["count"] as? Int else {
            return 0
        }
        return count
    }

    private var maxModeRemaining: Int { maxModeLimit - maxModeUsedToday }

    private var canUseMaxMode: Bool {
        storeKit.currentTier == .premium || (storeKit.currentTier == .pro && maxModeRemaining > 0)
    }

    private var maxModeInlineToggle: some View {
        Button {
            if !settings.maxModeEnabled && !canUseMaxMode {
                onShowPaywall()
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
                if storeKit.currentTier == .free {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(textSecondary)
                } else if storeKit.currentTier == .pro {
                    Text("\(maxModeRemaining)")
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
        .disabled(storeKit.currentTier == .free)
    }

    // MARK: - Deep Think

    private var deepThinkInlineToggle: some View {
        Button {
            if !isPremium && !settings.deepThinkEnabled {
                onShowPaywall()
            } else {
                withAnimation(.spring(response: 0.3)) {
                    settings.deepThinkEnabled.toggle()
                    settings.savePreferences()
                }
                triggerHaptic(.light)
                if settings.deepThinkEnabled {
                    showDeepThinkInfo = true
                    Task {
                        try? await Task.sleep(for: .seconds(3))
                        withAnimation(.easeOut(duration: 0.3)) { showDeepThinkInfo = false }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: settings.deepThinkEnabled ? "brain.head.profile.fill" : "brain.head.profile")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(settings.deepThinkEnabled ? .white : textSecondary)
                if !isPremium {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(textSecondary)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .buttonStyle(GlassCapsuleButtonStyle(
            tintColor: settings.deepThinkEnabled ? accentColor : nil,
            intensity: settings.deepThinkEnabled ? .standard : .subtle
        ))
    }

    // MARK: - Info Popups

    private var deepThinkInfoPopup: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.2))
                    .frame(width: 36, height: 36)
                Image(systemName: "brain.head.profile.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(accentColor)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Deep Think Enabled")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)
                Text("Responses take longer but are more advanced")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textSecondary)
            }
            Spacer()
            Button {
                withAnimation(.easeOut(duration: 0.2)) { showDeepThinkInfo = false }
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
                                colors: [accentColor.opacity(0.4), accentColor.opacity(0.1)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
        }
        .shadow(color: accentColor.opacity(0.2), radius: 20, y: 8)
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.1), radius: 10, y: 4)
        .padding(.horizontal, 20)
    }

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
                Text("PhD-level prompt engineering for maximum quality")
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

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}
