//
//  ContentView.swift
//  Prompt
//
//  Created by Justin Williams on 1/18/26.
//
//  iOS 26 Liquid Glass Design with In-Place Prompt Transformation
//  Brand Colors: Purple (#512AD4) and Cyan (#00FFF9)
//  AAA WCAG Compliant
//

import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(SettingsManager.self) private var settings
    @Environment(AuthManager.self) private var authManager
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(StoreKitManager.self) private var storeKit
    @State private var viewModel = PromptViewModel()
    @State private var showSettings = false
    @State private var showHistory = false
    @State private var showProfile = false
    @State private var showPaywall = false
    @State private var showTemplates = false

    // Animation states
    @State private var headerScale: CGFloat = 1.0
    @State private var buttonPressed = false
    @State private var showSuccessAnimation = false
    @State private var inputFocused = false
    @FocusState private var isTextEditorFocused: Bool

    // In-place transformation states
    @State private var isTransforming = false
    @State private var showEnhancedView = false
    @State private var transformationPhase: TransformationPhase = .idle

    enum TransformationPhase {
        case idle
        case analyzing
        case transforming
        case complete
    }

    // MARK: - Theme Colors (AAA Compliant)

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var bgTertiary: Color { Color.adaptiveBackgroundTertiary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }
    private var buttonSecondary: Color { Color.adaptiveButtonSecondary }
    private var borderColor: Color { Color.adaptiveBorder }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        NavigationStack {
            ZStack {
                // Adaptive background
                backgroundGradient

                ScrollView {
                    VStack(spacing: 24) {
                        headerCard
                            .scaleEffect(headerScale)
                            .onAppear {
                                withAnimation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.1)) {
                                    headerScale = 1.0
                                }
                            }

                        // Unified prompt section - transforms in place
                        promptSection
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .move(edge: .leading)),
                                removal: .opacity.combined(with: .move(edge: .trailing))
                            ))

                        // Deep Think toggle (only show when not viewing enhanced)
                        if !showEnhancedView {
                            deepThinkToggle
                        }

                        // Enhancement controls (only show when not viewing enhanced)
                        if !showEnhancedView {
                            enhancementControls
                        }

                        // Enhance/Edit button
                        actionButton

                        if showSuccessAnimation && !isTransforming {
                            SuccessCheckmark(size: 50, color: accentColor)
                                .transition(.scale.combined(with: .opacity))
                        }

                        Spacer(minLength: 100)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                }
                .scrollDismissesKeyboard(.interactively)

                // Overlay loading animation during transformation
                if isTransforming {
                    transformationOverlay
                        .transition(.opacity)
                }
            }
            .navigationTitle("Promptomize")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        // Usage indicator
                        if let usage = storeKit.usageInfo {
                            Button {
                                triggerHaptic(.light)
                                showPaywall = true
                            } label: {
                                UsageIndicator(used: usage.dailyPromptsUsed, limit: usage.dailyPromptsLimit)
                            }
                            .buttonStyle(.plain)
                        }

                        toolbarButton(icon: "doc.on.doc") {
                            triggerHaptic(.light)
                            showTemplates = true
                        }

                        toolbarButton(icon: "clock.arrow.trianglehead.counterclockwise.rotate.90") {
                            triggerHaptic(.light)
                            showHistory = true
                        }

                        toolbarButton(icon: "gearshape.fill") {
                            triggerHaptic(.light)
                            showSettings = true
                        }
                    }
                }

                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 12) {
                        profileButton

                        if showEnhancedView {
                            // Copy and Share buttons when viewing enhanced
                            toolbarButton(icon: "doc.on.doc.fill") {
                                triggerHaptic(.light)
                                viewModel.copyToClipboard()
                            }

                            ShareLink(item: viewModel.enhancedPrompt) {
                                Image(systemName: "square.and.arrow.up")
                                    .font(.system(size: 17, weight: .medium))
                                    .foregroundStyle(textPrimary)
                            }
                            .buttonStyle(BounceButtonStyle())
                        }
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showHistory) {
                HistoryView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showProfile) {
                ProfileView()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showPaywall) {
                PaywallView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showTemplates) {
                TemplatesView { template in
                    viewModel.userPrompt = template.content
                    showEnhancedView = false
                }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK", role: .cancel) {
                    triggerHaptic(.warning)
                }
            } message: {
                Text(viewModel.errorMessage ?? "An unknown error occurred")
            }
            .overlay(alignment: .bottom) {
                if viewModel.showCopiedToast {
                    toastView
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .onAppear {
            headerScale = 0.9
        }
    }

    // MARK: - Toolbar Button

    private func toolbarButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(textPrimary)
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(BounceButtonStyle())
    }

    private var profileButton: some View {
        Button {
            triggerHaptic(.light)
            showProfile = true
        } label: {
            if let avatarUrl = authManager.currentUser?.avatarUrl,
               let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    profilePlaceholder
                }
                .frame(width: 32, height: 32)
                .clipShape(Circle())
                .overlay(Circle().stroke(borderColor, lineWidth: 1))
            } else {
                profilePlaceholder
            }
        }
        .buttonStyle(BounceButtonStyle())
    }

    private var profilePlaceholder: some View {
        Circle()
            .fill(bgTertiary)
            .frame(width: 32, height: 32)
            .overlay {
                Image(systemName: "person.fill")
                    .font(.caption)
                    .foregroundStyle(textSecondary)
            }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LiquidGlassBackground()
    }

    // MARK: - Header Card

    private var headerCard: some View {
        VStack(spacing: 16) {
            // Use app logo if available
            Group {
                if UIImage(named: "AppLogo") != nil {
                    Image("AppLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 60, height: 60)
                } else {
                    Image(systemName: "wand.and.stars.inverse")
                        .font(.system(size: 44, weight: .light))
                        .foregroundStyle(textPrimary)
                        .symbolEffect(.pulse, options: .repeating)
                }
            }

            Text("Transform Your Prompts")
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            Text("Enter any prompt and get an optimized version using advanced AI techniques")
                .font(.subheadline)
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .liquidGlass(cornerRadius: 24, shadowIntensity: 1.2, borderGlow: true)
    }

    // MARK: - Unified Prompt Section (In-Place Transformation)

    private var promptSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Label(
                    showEnhancedView ? "Enhanced Prompt" : "Your Prompt",
                    systemImage: showEnhancedView ? "sparkles" : "text.cursor"
                )
                .font(.system(.subheadline, weight: .semibold))
                .foregroundStyle(textPrimary)
                .symbolEffect(.bounce, value: showEnhancedView)
                .contentTransition(.symbolEffect(.replace))

                Spacer()

                // Show character count for input, token count for output
                if showEnhancedView {
                    if viewModel.tokensUsed > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkle")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(accentColor)
                            Text("\(viewModel.tokensUsed) tokens")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(accentColor.opacity(0.15))
                        .clipShape(Capsule())
                    }
                } else if !viewModel.userPrompt.isEmpty {
                    Text("\(viewModel.characterCount)")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(bgSecondary)
                        .clipShape(Capsule())
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3), value: showEnhancedView)
            .animation(.spring(response: 0.3), value: viewModel.userPrompt.isEmpty)

            // Content area - transforms between input and output
            ZStack {
                if showEnhancedView {
                    // Enhanced prompt display
                    enhancedPromptView
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.98)),
                            removal: .opacity
                        ))
                } else {
                    // Input text editor
                    inputView
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.98)),
                            removal: .opacity
                        ))
                }
            }
            .animation(.spring(response: 0.5, dampingFraction: 0.8), value: showEnhancedView)

            // Clear button (only when editing)
            if !showEnhancedView {
                HStack {
                    Spacer()

                    if !viewModel.userPrompt.isEmpty {
                        Button {
                            triggerHaptic(.light)
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.userPrompt = ""
                            }
                        } label: {
                            Label("Clear", systemImage: "xmark.circle.fill")
                                .font(.system(.caption, weight: .medium))
                                .foregroundStyle(textSecondary)
                        }
                        .buttonStyle(BounceButtonStyle())
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .animation(.spring(response: 0.3), value: viewModel.userPrompt.isEmpty)
            }
        }
    }

    private var inputView: some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: $viewModel.userPrompt)
                .font(.system(.body, design: .default))
                .foregroundStyle(textPrimary)
                .frame(minHeight: 180, maxHeight: 300)
                .padding(16)
                .scrollContentBackground(.hidden)
                .liquidGlassInput(cornerRadius: 16, isFocused: isTextEditorFocused)
                .focused($isTextEditorFocused)

            if viewModel.userPrompt.isEmpty {
                Text("Describe what you want to achieve...")
                    .font(.body)
                    .foregroundStyle(textTertiary)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 24)
                    .allowsHitTesting(false)
            }
        }
    }

    private var enhancedPromptView: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                Text(viewModel.enhancedPrompt)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 180, maxHeight: 350)
        }
        .padding(16)
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
        .shadow(color: accentColor.opacity(0.2), radius: 20, y: 8)
    }

    // MARK: - Transformation Overlay

    private var transformationOverlay: some View {
        ZStack {
            // Dimmed background
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            // Logo enhancement animation
            VStack(spacing: 32) {
                LogoEnhancementAnimation(size: 160)

                VStack(spacing: 12) {
                    Text(transformationPhaseText)
                        .font(.system(.body, design: .rounded, weight: .medium))
                        .foregroundStyle(.white)
                        .contentTransition(.numericText())

                    WaveformVisualizer(color: accentColor)
                }
            }
            .padding(40)
            .background {
                RoundedRectangle(cornerRadius: 32, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .environment(\.colorScheme, .dark)
            }
        }
    }

    private var transformationPhaseText: String {
        switch transformationPhase {
        case .idle: return "Preparing..."
        case .analyzing: return "Analyzing your prompt..."
        case .transforming: return "Applying AI enhancement..."
        case .complete: return "Finalizing..."
        }
    }

    // MARK: - Deep Think Toggle

    private var isPremium: Bool {
        storeKit.currentTier == .premium || storeKit.currentTier == .pro
    }

    private var deepThinkToggle: some View {
        HStack(spacing: 12) {
            Image(systemName: settings.deepThinkEnabled ? "brain.head.profile.fill" : "brain.head.profile")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(settings.deepThinkEnabled ? accentColor : textSecondary)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("Deep Think")
                        .font(.system(.subheadline, weight: .semibold))
                        .foregroundStyle(textPrimary)

                    if !isPremium {
                        Text("PRO")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Color.adaptiveTextOnAccent)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(accentColor)
                            .clipShape(Capsule())
                    }
                }

                Text(settings.deepThinkEnabled ? "Slower but higher quality" : "Enable for better results")
                    .font(.system(.caption))
                    .foregroundStyle(textSecondary)
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { settings.deepThinkEnabled },
                set: { newValue in
                    if newValue && !isPremium {
                        showPaywall = true
                    } else {
                        withAnimation(.spring(response: 0.3)) {
                            settings.deepThinkEnabled = newValue
                            settings.savePreferences()
                        }
                        triggerHaptic(.light)
                    }
                }
            ))
            .labelsHidden()
            .tint(accentColor)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .liquidGlass(
            cornerRadius: 14,
            shadowIntensity: settings.deepThinkEnabled ? 1.2 : 0.8
        )
        .overlay {
            if settings.deepThinkEnabled {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(accentColor.opacity(0.4), lineWidth: 1.5)
            }
        }
    }

    // MARK: - Enhancement Controls

    private var enhancementControls: some View {
        VStack(spacing: 12) {
            // Tone Selector
            ToneSelector(
                selectedTone: Binding(
                    get: { settings.selectedTone },
                    set: { newValue in
                        settings.selectedTone = newValue
                        settings.savePreferences()
                    }
                ),
                onPremiumTap: {
                    showPaywall = true
                }
            )

            // Length Selector
            LengthSelector(selectedLength: Binding(
                get: { settings.outputLength },
                set: { newValue in
                    settings.outputLength = newValue
                    settings.savePreferences()
                }
            ))
        }
    }

    // MARK: - Action Button (Enhance / Edit Original)

    private var actionButton: some View {
        Group {
            if showEnhancedView {
                // Edit Original button
                Button {
                    triggerHaptic(.medium)
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        showEnhancedView = false
                    }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "pencil")
                            .font(.system(size: 18, weight: .semibold))

                        Text("Edit Original")
                            .font(.system(.body, design: .rounded, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundStyle(textPrimary)
                }
                .buttonStyle(LiquidGlassButtonStyle(cornerRadius: 14))
            } else {
                // Enhance button
                Button {
                    triggerHaptic(.medium)
                    isTextEditorFocused = false

                    // Check quota before enhancing
                    if !storeKit.canCreatePrompt {
                        showPaywall = true
                        return
                    }

                    performEnhancement()
                } label: {
                    HStack(spacing: 12) {
                        if viewModel.isLoading && !isTransforming {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(Color.adaptiveTextOnAccent)
                                .scaleEffect(0.9)
                        } else {
                            Image(systemName: "sparkles")
                                .font(.system(size: 18, weight: .semibold))
                                .symbolEffect(.bounce, value: buttonPressed)
                        }

                        Text(viewModel.isLoading ? "Enhancing..." : "Enhance Prompt")
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .contentTransition(.numericText())
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundStyle(viewModel.canEnhance ? Color.adaptiveTextOnAccent : textTertiary)
                    .background {
                        if viewModel.canEnhance {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(buttonPrimary)
                                .shadow(color: accentColor.opacity(0.4), radius: 12, y: 6)
                        } else {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(.ultraThinMaterial)
                                .overlay {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(bgTertiary.opacity(0.5))
                                }
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(ElasticButtonStyle())
                .disabled(!viewModel.canEnhance)
                .animation(.spring(response: 0.3), value: viewModel.canEnhance)
                .animation(.spring(response: 0.3), value: viewModel.isLoading)
                .sensoryFeedback(.impact(flexibility: .soft), trigger: buttonPressed)
            }
        }
    }

    // MARK: - Enhancement Logic

    private func performEnhancement() {
        Task {
            // Show transformation overlay
            withAnimation(.easeInOut(duration: 0.3)) {
                isTransforming = true
                transformationPhase = .analyzing
            }

            // Phase progression
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation { transformationPhase = .transforming }
            }

            let startTime = Date()
            await viewModel.enhancePrompt(settings: settings)

            if viewModel.hasEnhancedPrompt {
                withAnimation { transformationPhase = .complete }

                // Brief delay before revealing result
                try? await Task.sleep(nanoseconds: 500_000_000)

                // Hide overlay and show enhanced view
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                    isTransforming = false
                    showEnhancedView = true
                    showSuccessAnimation = true
                }

                triggerHaptic(.success)

                // Hide success animation after delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    withAnimation(.easeOut(duration: 0.3)) {
                        showSuccessAnimation = false
                    }
                }

                let processingMs = Int(Date().timeIntervalSince(startTime) * 1000)
                _ = await historyManager.savePrompt(
                    original: viewModel.userPrompt,
                    enhanced: viewModel.enhancedPrompt,
                    model: settings.selectedModel.rawValue,
                    temperature: settings.temperature,
                    maxTokens: settings.maxTokens,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: viewModel.tokensUsed,
                    processingMs: processingMs
                )

                // Refresh subscription usage after successful enhancement
                await storeKit.syncWithBackend()
            } else {
                // Error occurred
                withAnimation(.easeInOut(duration: 0.3)) {
                    isTransforming = false
                }
                triggerHaptic(.error)
            }

            transformationPhase = .idle
        }
    }

    // MARK: - Toast View

    private var toastView: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(accentColor)
                .symbolEffect(.bounce, value: viewModel.showCopiedToast)
            Text("Copied to clipboard")
                .font(.system(.subheadline, weight: .semibold))
                .foregroundStyle(textPrimary)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.15), radius: 20, y: 8)
        .padding(.bottom, 30)
    }

    // MARK: - Haptic Feedback

    private func triggerHaptic(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(type)
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}

#Preview {
    ContentView()
        .environment(SettingsManager())
        .environment(AuthManager.shared)
        .environment(PromptHistoryManager.shared)
        .environment(StoreKitManager.shared)
}
