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
import StoreKit

struct ContentView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase
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
    @State private var showThreads = false

    // Power Tools inline expansion
    @State private var expandedPowerTool: PowerToolsSection.PowerTool?
    @State private var showFullPlatformStudio = false
    @State private var showFullVariations = false
    @State private var showSandbox = false
    @State private var showWorkflows = false
    @State private var showContexts = false

    // Inline feature integration
    @State private var selectedPlatform: PlatformType?
    @State private var attachedContext: ProjectContext?
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @State private var syncManager = SyncManager.shared
    @State private var deeplinkManager = DeeplinkManager.shared

    // What's New tracking
    @AppStorage("lastSeenWhatsNewVersion") private var lastSeenWhatsNewVersion = ""
    @State private var showWhatsNew = false

    // Paywall reminder tracking
    @AppStorage("hasSeenOnboardingPaywall") private var hasSeenOnboardingPaywall = false
    @AppStorage("lastPaywallShownDate") private var lastPaywallShownDateString = ""

    // App review prompt tracking
    @AppStorage("lastReviewPromptDate") private var lastReviewPromptDateString = ""
    @AppStorage("enhancementCount") private var enhancementCount = 0

    // Animation states
    @State private var headerScale: CGFloat = 1.0
    @State private var buttonPressed = false
    @State private var showSuccessAnimation = false
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

                        if !showEnhancedView {
                            // Input mode
                            PromptInputCard(
                                userPrompt: $viewModel.userPrompt,
                                isTextEditorFocused: $isTextEditorFocused,
                                isTransforming: isTransforming,
                                transformationPhaseText: transformationPhaseText,
                                selectedPlatform: selectedPlatform,
                                onShowPaywall: { showPaywall = true }
                            )
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .scale(scale: 0.98)),
                                removal: .opacity
                            ))

                            EnhancementOptionsBar(
                                selectedPlatform: $selectedPlatform,
                                attachedContext: $attachedContext,
                                onShowTemplates: { showTemplates = true },
                                onShowThreads: { showThreads = true }
                            )
                            .transition(.opacity.combined(with: .move(edge: .top)))

                            // Clear button
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
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 6)
                                    }
                                    .buttonStyle(GlassCapsuleButtonStyle())
                                    .transition(.scale.combined(with: .opacity))
                                }
                            }
                            .animation(.spring(response: 0.3), value: viewModel.userPrompt.isEmpty)
                        }

                        if showEnhancedView {
                            // Results mode
                            EnhancedPromptCard(
                                enhancedPrompt: viewModel.enhancedPrompt,
                                tokensUsed: viewModel.tokensUsed,
                                isCurrentPromptFavorite: viewModel.isCurrentPromptFavorite,
                                onCopy: {
                                    triggerHaptic(.light)
                                    viewModel.copyToClipboard()
                                },
                                onOpenClaude: {
                                    triggerHaptic(.light)
                                    openInClaude()
                                },
                                onOpenChatGPT: {
                                    triggerHaptic(.light)
                                    openInChatGPT()
                                },
                                onSave: {
                                    triggerHaptic(.light)
                                    toggleCurrentPromptFavorite()
                                },
                                onShare: {
                                    triggerHaptic(.light)
                                },
                                onStartThread: {
                                    triggerHaptic(.light)
                                    showThreads = true
                                },
                                onClear: {
                                    triggerHaptic(.light)
                                    clearAndReset()
                                }
                            )
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .scale(scale: 0.98)),
                                removal: .opacity
                            ))

                            PowerToolsSection(
                                expandedTool: $expandedPowerTool,
                                enhancedPrompt: viewModel.enhancedPrompt,
                                onApplyPrompt: { newPrompt in
                                    withAnimation(.spring(response: 0.4)) {
                                        viewModel.enhancedPrompt = newPrompt
                                    }
                                    triggerHaptic(.success)
                                },
                                onShowPaywall: { showPaywall = true },
                                onOpenSheet: { tool in
                                    handlePowerToolSheet(tool)
                                }
                            )
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }

                        // Enhance / Edit Original button
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
            }
            .navigationTitle("Promptomize")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 8) {
                        // Sync status indicator
                        if syncManager.pendingCount > 0 || syncManager.isSyncing {
                            SyncStatusIndicator(
                                pendingCount: syncManager.pendingCount,
                                isSyncing: syncManager.isSyncing,
                                isOnline: networkMonitor.isConnected
                            )
                        }

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

                        toolbarButton(icon: "clock.arrow.circlepath") {
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
                    profileButton
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showHistory) {
                HistoryView { originalPrompt in
                    viewModel.userPrompt = originalPrompt
                    viewModel.enhancedPrompt = ""
                    showEnhancedView = false
                }
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
            .sheet(isPresented: $showThreads) {
                ThreadListView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showContexts) {
                ContextsView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showSandbox) {
                SandboxView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showWorkflows) {
                WorkflowsView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showFullPlatformStudio) {
                PlatformOptimizationView(promptText: viewModel.enhancedPrompt.isEmpty ? viewModel.userPrompt : viewModel.enhancedPrompt)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showFullVariations) {
                VariationsView(promptText: viewModel.enhancedPrompt.isEmpty ? viewModel.userPrompt : viewModel.enhancedPrompt)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showWhatsNew) {
                WhatsNewView {
                    lastSeenWhatsNewVersion = currentAppVersion
                    showWhatsNew = false
                }
                .presentationDetents([.medium, .large])
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
            .errorAlert(handler: ErrorHandler.shared) { action in
                handleErrorAction(action)
            }
            .overlay(alignment: .top) {
                OfflineBanner()
                    .animation(.spring(response: 0.3), value: networkMonitor.isConnected)
            }
            .overlay(alignment: .bottom) {
                if viewModel.showCopiedToast {
                    toastView
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: showEnhancedView)
        .onAppear {
            headerScale = 0.9
            checkPaywallReminder()
            checkWhatsNew()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                checkDailyPaywallReminder()
            }
        }
        .onChange(of: deeplinkManager.shouldOpenEnhance) { _, shouldOpen in
            if shouldOpen {
                withAnimation(.spring(response: 0.4)) {
                    showEnhancedView = false
                }
                isTextEditorFocused = true
                deeplinkManager.clearEnhanceTrigger()
            }
        }
        .onChange(of: deeplinkManager.shouldOpenHistory) { _, shouldOpen in
            if shouldOpen {
                showHistory = true
                deeplinkManager.clearHistoryTrigger()
            }
        }
        .onChange(of: deeplinkManager.shouldOpenSettings) { _, shouldOpen in
            if shouldOpen {
                showSettings = true
                deeplinkManager.clearSettingsTrigger()
            }
        }
        .onChange(of: deeplinkManager.shouldOpenPaywall) { _, shouldOpen in
            if shouldOpen {
                showPaywall = true
                deeplinkManager.clearPaywallTrigger()
            }
        }
        .onChange(of: viewModel.showPaywall) { _, shouldShow in
            if shouldShow {
                showPaywall = true
                viewModel.showPaywall = false
            }
        }
    }

    // MARK: - Power Tool Sheet Handler

    private func handlePowerToolSheet(_ tool: PowerToolsSection.PowerTool) {
        switch tool {
        case .platformOptimize:
            showFullPlatformStudio = true
        case .variations:
            showFullVariations = true
        case .sandbox:
            showSandbox = true
        case .workflows:
            showWorkflows = true
        }
    }

    // MARK: - Toolbar Button

    private func toolbarButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(textPrimary)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 32, height: 32)
        }
        .buttonStyle(GlassIconButtonStyle(size: 32))
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
                    profilePlaceholderContent
                }
                .frame(width: 32, height: 32)
                .clipShape(Circle())
                .overlay {
                    Circle()
                        .stroke(
                            LinearGradient(
                                colors: colorScheme == .dark
                                    ? [Color.white.opacity(0.2), Color.white.opacity(0.05)]
                                    : [Color.white.opacity(0.8), Color.brandPurple.opacity(0.2)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1.5
                        )
                }
                .shadow(color: colorScheme == .dark ? Color.black.opacity(0.4) : Color.brandPurple.opacity(0.15), radius: 6, y: 3)
            } else {
                profilePlaceholder
            }
        }
        .buttonStyle(.plain)
    }

    private var profilePlaceholderContent: some View {
        Image(systemName: "person.fill")
            .font(.caption)
            .foregroundStyle(textSecondary)
    }

    private var profilePlaceholder: some View {
        ZStack {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: 36, height: 36)

            Circle()
                .fill(
                    LinearGradient(
                        colors: colorScheme == .dark
                            ? [Color.white.opacity(0.1), Color.clear]
                            : [Color.white.opacity(0.8), Color.clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 36, height: 36)

            Image(systemName: "person.fill")
                .font(.system(size: 14))
                .foregroundStyle(textSecondary)
        }
        .overlay {
            Circle()
                .stroke(
                    LinearGradient(
                        colors: colorScheme == .dark
                            ? [Color.white.opacity(0.2), Color.white.opacity(0.05)]
                            : [Color.white.opacity(0.8), Color.brandPurple.opacity(0.2)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        }
        .shadow(color: colorScheme == .dark ? Color.black.opacity(0.4) : Color.brandPurple.opacity(0.15), radius: 6, y: 3)
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LiquidGlassBackground()
    }

    // MARK: - Header Card

    private var headerCard: some View {
        HStack(spacing: 16) {
            Group {
                if UIImage(named: "AppLogo") != nil {
                    Image("AppLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 48, height: 48)
                } else {
                    Image(systemName: "wand.and.stars.inverse")
                        .font(.system(size: 32, weight: .light))
                        .foregroundStyle(textPrimary)
                        .symbolEffect(.pulse, options: .repeating)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Transform Your Prompts")
                    .font(.system(.headline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text("Get optimized prompts using advanced AI")
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .lineLimit(2)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .liquidGlass(cornerRadius: 20, shadowIntensity: 1.0, borderGlow: true)
    }

    // MARK: - Action Button (Enhance / Edit Original)

    private var enhanceButtonTitle: String {
        if viewModel.isLoading {
            return "Enhancing..."
        } else if let platform = selectedPlatform {
            return "Enhance for \(platform.displayName)"
        } else {
            return "Enhance Prompt"
        }
    }

    private var transformationPhaseText: String {
        switch transformationPhase {
        case .idle: return "Preparing..."
        case .analyzing: return "Analyzing..."
        case .transforming: return "Enhancing..."
        case .complete: return "Done!"
        }
    }

    private var actionButton: some View {
        Group {
            if showEnhancedView {
                Button {
                    triggerHaptic(.medium)
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        showEnhancedView = false
                        expandedPowerTool = nil
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
                Button {
                    triggerHaptic(.medium)
                    isTextEditorFocused = false

                    if !storeKit.canCreatePrompt {
                        showPaywall = true
                        return
                    }

                    if selectedPlatform != nil && storeKit.currentTier == .free {
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

                        Text(enhanceButtonTitle)
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .contentTransition(.numericText())
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundStyle(viewModel.canEnhance ? .white : textTertiary)
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

    /// MAX MODE access: Premium = unlimited, Pro = 5/day, Free = none
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

    private func incrementMaxModeUsage() {
        let defaults = UserDefaults(suiteName: "group.com.res.promptomizer")
        let today = formattedDate(Date())
        defaults?.set(["date": today, "count": maxModeUsedToday + 1], forKey: "maxModeUsage")
    }

    private func performEnhancement() {
        Task {
            if settings.maxModeEnabled && storeKit.currentTier == .pro && maxModeRemaining <= 0 {
                viewModel.errorMessage = "MAX MODE limit reached. Upgrade to Premium for unlimited MAX prompts."
                viewModel.showError = true
                settings.maxModeEnabled = false
                settings.savePreferences()
                return
            }

            withAnimation(.easeInOut(duration: 0.3)) {
                isTransforming = true
                transformationPhase = .analyzing
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation { transformationPhase = .transforming }
            }

            let startTime = Date()

            if let context = attachedContext {
                let contextDataStr = context.contextData.map { "\($0.key): \($0.value)" }.joined(separator: ", ")
                if !contextDataStr.isEmpty {
                    let existing = settings.customInstructions
                    let contextInstruction = "Use the following context data: \(contextDataStr)"
                    settings.customInstructions = existing.isEmpty ? contextInstruction : "\(existing). \(contextInstruction)"
                    await viewModel.enhancePrompt(
                        settings: settings,
                        targetPlatform: selectedPlatform?.backendPlatformKey
                    )
                    settings.customInstructions = existing
                } else {
                    await viewModel.enhancePrompt(
                        settings: settings,
                        targetPlatform: selectedPlatform?.backendPlatformKey
                    )
                }
            } else {
                await viewModel.enhancePrompt(
                    settings: settings,
                    targetPlatform: selectedPlatform?.backendPlatformKey
                )
            }

            if viewModel.hasEnhancedPrompt {
                withAnimation { transformationPhase = .complete }

                if settings.maxModeEnabled && storeKit.currentTier == .pro {
                    incrementMaxModeUsage()
                }

                try? await Task.sleep(nanoseconds: 500_000_000)

                withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                    isTransforming = false
                    showEnhancedView = true
                    showSuccessAnimation = true
                }

                triggerHaptic(.success)

                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    withAnimation(.easeOut(duration: 0.3)) {
                        showSuccessAnimation = false
                    }
                }

                let processingMs = Int(Date().timeIntervalSince(startTime) * 1000)
                if let savedPrompt = await historyManager.savePrompt(
                    original: viewModel.userPrompt,
                    enhanced: viewModel.enhancedPrompt,
                    model: settings.selectedModel.rawValue,
                    temperature: settings.temperature,
                    maxTokens: settings.maxTokens,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: viewModel.tokensUsed,
                    processingMs: processingMs
                ) {
                    viewModel.setCurrentPromptId(savedPrompt.id)
                }

                await storeKit.syncWithBackend()
                enhancementCount += 1
                checkReviewPrompt()
            } else {
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
        .background {
            ZStack {
                Capsule()
                    .fill(colorScheme == .dark
                        ? Color(red: 38/255, green: 38/255, blue: 40/255)
                        : Color.white)
                Capsule()
                    .fill(.ultraThinMaterial)
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: colorScheme == .dark
                                ? [Color.white.opacity(0.1), Color.clear]
                                : [Color.white.opacity(0.8), Color.clear],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .opacity(0.5)
            }
        }
        .clipShape(Capsule())
        .overlay {
            Capsule()
                .stroke(
                    LinearGradient(
                        colors: colorScheme == .dark
                            ? [accentColor.opacity(0.4), accentColor.opacity(0.1)]
                            : [Color.white.opacity(0.8), Color.brandPurple.opacity(0.2)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        }
        .shadow(color: accentColor.opacity(0.2), radius: 12, y: 0)
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.5 : 0.15), radius: 20, y: 8)
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

    // MARK: - AI Service Links

    private func openInClaude() {
        guard !viewModel.enhancedPrompt.isEmpty,
              let encodedPrompt = viewModel.enhancedPrompt.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://claude.ai/new?q=\(encodedPrompt)") else {
            return
        }
        UIApplication.shared.open(url)
    }

    private func openInChatGPT() {
        guard !viewModel.enhancedPrompt.isEmpty,
              let encodedPrompt = viewModel.enhancedPrompt.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://chatgpt.com/?q=\(encodedPrompt)") else {
            return
        }
        UIApplication.shared.open(url)
    }

    private func clearAndReset() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
            showEnhancedView = false
            expandedPowerTool = nil
            viewModel.clearAll()
        }
    }

    private func toggleCurrentPromptFavorite() {
        guard let promptId = viewModel.currentPromptId else { return }
        viewModel.isCurrentPromptFavorite.toggle()
        if let prompt = historyManager.prompts.first(where: { $0.id == promptId }) {
            Task { await historyManager.toggleFavorite(prompt) }
        }
    }

    // MARK: - Error Action Handling

    private func handleErrorAction(_ action: ErrorAction) {
        switch action {
        case .retry:
            if !viewModel.userPrompt.isEmpty && !viewModel.isLoading {
                performEnhancement()
            }
        case .signIn:
            showProfile = true
        case .upgrade:
            showPaywall = true
        case .contactSupport:
            if let url = URL(string: "mailto:support@promptomize.app") {
                UIApplication.shared.open(url)
            }
        case .checkConnection:
            triggerHaptic(.warning)
        case .refreshApp:
            Task { await storeKit.syncWithBackend() }
        case .none:
            break
        }
    }

    // MARK: - What's New Logic

    private var currentAppVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    private func checkWhatsNew() {
        guard lastSeenWhatsNewVersion != currentAppVersion else { return }
        guard !lastSeenWhatsNewVersion.isEmpty else {
            lastSeenWhatsNewVersion = currentAppVersion
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            showWhatsNew = true
        }
    }

    // MARK: - Paywall Reminder Logic

    private func checkPaywallReminder() {
        if !hasSeenOnboardingPaywall && authManager.isAuthenticated {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                showPaywall = true
                hasSeenOnboardingPaywall = true
                updateLastPaywallShownDate()
            }
        }
    }

    private func checkDailyPaywallReminder() {
        guard storeKit.currentTier == .free else { return }
        let today = formattedDate(Date())
        guard lastPaywallShownDateString != today else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            if storeKit.currentTier == .free {
                showPaywall = true
                updateLastPaywallShownDate()
            }
        }
    }

    private func updateLastPaywallShownDate() {
        lastPaywallShownDateString = formattedDate(Date())
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    // MARK: - App Review Prompt Logic

    private func checkReviewPrompt() {
        guard enhancementCount >= 3 else { return }
        let today = Date()
        if let lastPromptDate = parseDate(lastReviewPromptDateString) {
            let daysSinceLastPrompt = Calendar.current.dateComponents([.day], from: lastPromptDate, to: today).day ?? 0
            guard daysSinceLastPrompt >= 3 else { return }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            requestAppReview()
            lastReviewPromptDateString = formattedDate(today)
        }
    }

    private func requestAppReview() {
        if let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) {
            SKStoreReviewController.requestReview(in: windowScene)
        }
    }

    private func parseDate(_ dateString: String) -> Date? {
        guard !dateString.isEmpty else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: dateString)
    }
}

#Preview {
    ContentView()
        .environment(SettingsManager())
        .environment(AuthManager.shared)
        .environment(PromptHistoryManager.shared)
        .environment(StoreKitManager.shared)
}

// MARK: - Sync Status Indicator

struct SyncStatusIndicator: View {
    let pendingCount: Int
    let isSyncing: Bool
    let isOnline: Bool

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 4) {
            if isSyncing {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(0.7)
                    .tint(Color.brandCyan)
            } else if !isOnline {
                Image(systemName: "cloud.slash.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.orange)
            } else {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.brandCyan)
            }

            if pendingCount > 0 {
                Text("\(pendingCount)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(colorScheme == .dark ? Color.brandCyan : Color.brandPurple)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .liquidGlassChip(isSelected: false)
    }
}
