//
//  ContentView.swift
//  Prompt
//
//  Created by Justin Williams on 1/18/26.
//
//  iOS 26 Enhanced with Liquid Glass, Micro-animations, and AAA Contrast Compliance
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

    // Animation states
    @State private var headerScale: CGFloat = 1.0
    @State private var buttonPressed = false
    @State private var showSuccessAnimation = false
    @State private var inputFocused = false
    @FocusState private var isTextEditorFocused: Bool

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

                        inputSection
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .move(edge: .leading)),
                                removal: .opacity.combined(with: .move(edge: .trailing))
                            ))

                        enhanceButton

                        if viewModel.isLoading {
                            loadingSection
                                .transition(.opacity.combined(with: .scale(scale: 0.9)))
                        }

                        if viewModel.hasEnhancedPrompt && !viewModel.isLoading {
                            outputSection
                                .transition(.asymmetric(
                                    insertion: .opacity.combined(with: .move(edge: .bottom)).combined(with: .scale(scale: 0.95)),
                                    removal: .opacity
                                ))
                        }

                        if showSuccessAnimation {
                            SuccessCheckmark(size: 50, color: colorScheme == .dark ? .white : .black)
                                .transition(.scale.combined(with: .opacity))
                        }

                        Spacer(minLength: 100)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                }
                .scrollDismissesKeyboard(.interactively)
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

                        if viewModel.hasEnhancedPrompt {
                            toolbarButton(icon: "arrow.counterclockwise") {
                                triggerHaptic(.medium)
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                                    viewModel.clearAll()
                                    showSuccessAnimation = false
                                }
                            }
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
        ZStack {
            bgPrimary

            // Subtle animated particles (reduced in dark mode)
            FloatingParticles(count: 12, color: textTertiary)
                .opacity(colorScheme == .dark ? 0.15 : 0.2)
        }
        .ignoresSafeArea()
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
        .background {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.08), radius: 12, y: 4)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(borderColor.opacity(0.5), lineWidth: 1)
        }
    }

    // MARK: - Input Section

    private var inputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Your Prompt", systemImage: "text.cursor")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)
                    .symbolEffect(.bounce, value: isTextEditorFocused)

                Spacer()

                if !viewModel.userPrompt.isEmpty {
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
            .animation(.spring(response: 0.3), value: viewModel.userPrompt.isEmpty)

            ZStack(alignment: .topLeading) {
                TextEditor(text: $viewModel.userPrompt)
                    .font(.system(.body, design: .default))
                    .foregroundStyle(textPrimary)
                    .frame(minHeight: 150, maxHeight: 250)
                    .padding(16)
                    .scrollContentBackground(.hidden)
                    .background(bgSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(
                                isTextEditorFocused ? textPrimary : borderColor,
                                lineWidth: isTextEditorFocused ? 2 : 1
                            )
                            .animation(.easeInOut(duration: 0.2), value: isTextEditorFocused)
                    )
                    .shadow(color: Color.black.opacity(isTextEditorFocused ? 0.12 : 0.04), radius: isTextEditorFocused ? 12 : 5, y: 2)
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

    // MARK: - Enhance Button

    private var enhanceButton: some View {
        Button {
            triggerHaptic(.medium)
            isTextEditorFocused = false

            // Check quota before enhancing
            if !storeKit.canCreatePrompt {
                showPaywall = true
                return
            }

            Task {
                let startTime = Date()
                // Tier is now determined server-side based on subscription
                await viewModel.enhancePrompt(settings: settings)

                if viewModel.hasEnhancedPrompt {
                    triggerHaptic(.success)

                    withAnimation(.spring(response: 0.4)) {
                        showSuccessAnimation = true
                    }

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
                    triggerHaptic(.error)
                }
            }
        } label: {
            HStack(spacing: 12) {
                if viewModel.isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(colorScheme == .dark ? .black : .white)
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
            .background(viewModel.canEnhance ? buttonPrimary : bgTertiary)
            .foregroundStyle(viewModel.canEnhance ? (colorScheme == .dark ? Color.black : Color.white) : textTertiary)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: viewModel.canEnhance ? Color.black.opacity(0.2) : .clear, radius: 12, y: 6)
        }
        .buttonStyle(ElasticButtonStyle())
        .disabled(!viewModel.canEnhance)
        .animation(.spring(response: 0.3), value: viewModel.canEnhance)
        .animation(.spring(response: 0.3), value: viewModel.isLoading)
        .sensoryFeedback(.impact(flexibility: .soft), trigger: buttonPressed)
    }

    // MARK: - Loading Section

    private var loadingSection: some View {
        VStack(spacing: 20) {
            PromptEnhancementLoader()
                .environment(\.colorScheme, colorScheme)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Output Section

    private var outputSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Enhanced Prompt", systemImage: "doc.text.fill")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)
                    .symbolEffect(.bounce, value: viewModel.hasEnhancedPrompt)

                Spacer()

                if viewModel.tokensUsed > 0 {
                    Text("\(viewModel.tokensUsed) tokens")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(bgSecondary)
                        .clipShape(Capsule())
                }
            }

            ScrollView {
                Text(viewModel.enhancedPrompt)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 180, maxHeight: 350)
            .padding(16)
            .background(bgSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(textPrimary, lineWidth: 1.5)
            )
            .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.08), radius: 8, y: 2)

            // Action Buttons
            HStack(spacing: 12) {
                Button {
                    triggerHaptic(.light)
                    viewModel.copyToClipboard()
                } label: {
                    Label("Copy", systemImage: "doc.on.doc.fill")
                        .font(.system(.subheadline, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(buttonSecondary)
                        .foregroundStyle(textPrimary)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(ElasticButtonStyle())

                ShareLink(item: viewModel.enhancedPrompt) {
                    Label("Share", systemImage: "square.and.arrow.up.fill")
                        .font(.system(.subheadline, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(buttonSecondary)
                        .foregroundStyle(textPrimary)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(ElasticButtonStyle())
            }
        }
    }

    // MARK: - Toast View

    private var toastView: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(colorScheme == .dark ? Color.green.opacity(0.9) : Color.green)
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
