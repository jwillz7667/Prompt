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
    @State private var showContexts = false
    @State private var showSandbox = false
    @State private var showWorkflows = false
    @State private var showPlatforms = false
    @State private var showVariations = false

    // Inline feature integration
    @State private var selectedPlatform: PlatformType?
    @State private var showPlatformPicker = false
    @State private var attachedContext: ProjectContext?
    @StateObject private var contextService = ContextService.shared
    @State private var showContextPicker = false
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
    @State private var inputFocused = false
    @FocusState private var isTextEditorFocused: Bool

    // In-place transformation states
    @State private var isTransforming = false
    @State private var showEnhancedView = false
    @State private var transformationPhase: TransformationPhase = .idle

    // Pulsing animation states
    @State private var pulsingScale: CGFloat = 1.0
    @State private var pulsingOpacity: Double = 0.7

    // Info popups
    @State private var showDeepThinkInfo = false
    @State private var showMaxModeInfo = false

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

                        toolbarButton(icon: "doc.on.doc") {
                            triggerHaptic(.light)
                            showTemplates = true
                        }

                        toolbarButton(icon: "bubble.left.and.bubble.right") {
                            triggerHaptic(.light)
                            showThreads = true
                        }

                        toolbarButton(icon: "clock.arrow.circlepath") {
                            triggerHaptic(.light)
                            showHistory = true
                        }

                        toolbarButton(icon: "gearshape.fill") {
                            triggerHaptic(.light)
                            showSettings = true
                        }

                        Menu {
                            Section("Manage") {
                                Button {
                                    triggerHaptic(.light)
                                    showContexts = true
                                } label: {
                                    Label("Contexts", systemImage: "folder.badge.gearshape")
                                }
                            }

                            Section("Pro Features") {
                                Button {
                                    triggerHaptic(.light)
                                    if storeKit.currentTier == .free {
                                        showPaywall = true
                                    } else {
                                        showPlatforms = true
                                    }
                                } label: {
                                    Label("Platform Studio", systemImage: "cpu")
                                }
                                Button {
                                    triggerHaptic(.light)
                                    if storeKit.currentTier == .free {
                                        showPaywall = true
                                    } else {
                                        showVariations = true
                                    }
                                } label: {
                                    Label("Variations", systemImage: "rectangle.on.rectangle")
                                }
                            }

                            Section("Premium Features") {
                                Button {
                                    triggerHaptic(.light)
                                    if storeKit.currentTier != .premium {
                                        showPaywall = true
                                    } else {
                                        showSandbox = true
                                    }
                                } label: {
                                    Label("Sandbox", systemImage: "flask")
                                }
                                Button {
                                    triggerHaptic(.light)
                                    if storeKit.currentTier != .premium {
                                        showPaywall = true
                                    } else {
                                        showWorkflows = true
                                    }
                                } label: {
                                    Label("Workflows", systemImage: "arrow.triangle.branch")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(textSecondary)
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
            .sheet(isPresented: $showPlatforms) {
                PlatformOptimizationView(promptText: viewModel.enhancedPrompt.isEmpty ? viewModel.userPrompt : viewModel.enhancedPrompt)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showVariations) {
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
            .overlay(alignment: .top) {
                if showDeepThinkInfo {
                    deepThinkInfoPopup
                        .transition(.asymmetric(
                            insertion: .move(edge: .top).combined(with: .opacity),
                            removal: .opacity
                        ))
                        .padding(.top, 60)
                }
            }
            .overlay(alignment: .top) {
                if showMaxModeInfo {
                    maxModeInfoPopup
                        .transition(.asymmetric(
                            insertion: .move(edge: .top).combined(with: .opacity),
                            removal: .opacity
                        ))
                        .padding(.top, 60)
                }
            }
            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: showDeepThinkInfo)
            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: showMaxModeInfo)
        }
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
        // Handle deeplinks from widgets
        .onChange(of: deeplinkManager.shouldOpenEnhance) { _, shouldOpen in
            if shouldOpen {
                // Already on enhance screen, just clear and focus
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
        // Show paywall when quota exceeded
        .onChange(of: viewModel.showPaywall) { _, shouldShow in
            if shouldShow {
                showPaywall = true
                viewModel.showPaywall = false // Reset the viewModel state
            }
        }
    }

    // MARK: - Deep Think Info Popup

    private var deepThinkInfoPopup: some View {
        HStack(spacing: 12) {
            // Brain icon with glow
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

            // Dismiss button - glass circle
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    showDeepThinkInfo = false
                }
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
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
        }
        .shadow(color: accentColor.opacity(0.2), radius: 20, y: 8)
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.1), radius: 10, y: 4)
        .padding(.horizontal, 20)
    }

    // MARK: - MAX Mode Info Popup

    private var maxModeInfoPopup: some View {
        HStack(spacing: 12) {
            // Flame icon with orange glow
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

            // Dismiss button - glass circle
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    showMaxModeInfo = false
                }
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
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
        }
        .shadow(color: Color.orange.opacity(0.2), radius: 20, y: 8)
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.1), radius: 10, y: 4)
        .padding(.horizontal, 20)
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
            // Use app logo if available
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

            // Enhancement options bar (platform + context, only when editing)
            if !showEnhancedView {
                enhancementOptionsBar
                    .transition(.opacity.combined(with: .move(edge: .top)))

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

            // Post-enhancement inline actions
            if showEnhancedView {
                postEnhancementActions
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
    }

    // MARK: - Enhancement Options Bar (Platform + Context)

    private var enhancementOptionsBar: some View {
        VStack(spacing: 8) {
            // Platform selector
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    // Platform label
                    Label("Platform", systemImage: "cpu")
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(textTertiary)

                    // "Any" chip (no platform filter)
                    platformChip(name: "Any", icon: "globe", isSelected: selectedPlatform == nil) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedPlatform = nil
                        }
                        triggerHaptic(.light)
                    }

                    // Popular platforms (exclude .custom)
                    ForEach(PlatformType.allCases.filter { $0 != .custom }) { platform in
                        platformChip(
                            name: platform.displayName,
                            icon: platform.icon,
                            isSelected: selectedPlatform == platform,
                            platformColor: Color(hex: platform.color)
                        ) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                selectedPlatform = selectedPlatform == platform ? nil : platform
                            }
                            triggerHaptic(.light)
                        }
                    }
                }
            }

            // Context attachment row
            HStack(spacing: 8) {
                if let context = attachedContext {
                    // Show attached context
                    HStack(spacing: 6) {
                        Image(systemName: context.isGlobal ? "globe" : "folder.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(accentColor)

                        Text(context.name)
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(textPrimary)
                            .lineLimit(1)

                        Button {
                            withAnimation(.spring(response: 0.3)) {
                                attachedContext = nil
                            }
                            triggerHaptic(.light)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(textTertiary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .liquidGlassChip(isSelected: true, accentColor: accentColor)
                    .transition(.scale.combined(with: .opacity))
                } else if !contextService.contexts.isEmpty {
                    // Show attach button
                    Button {
                        showContextPicker = true
                        triggerHaptic(.light)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus.circle")
                                .font(.system(size: 12, weight: .medium))
                            Text("Attach Context")
                                .font(.system(.caption, design: .rounded, weight: .medium))
                        }
                        .foregroundStyle(textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(GlassCapsuleButtonStyle())
                }

                Spacer()

                // Pro badge if platform selected
                if selectedPlatform != nil && storeKit.currentTier == .free {
                    HStack(spacing: 3) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 8, weight: .bold))
                        Text("PRO")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.orange.opacity(0.12))
                    .clipShape(Capsule())
                }
            }
            .animation(.spring(response: 0.3), value: attachedContext?.id)
        }
        .popover(isPresented: $showContextPicker) {
            contextPickerPopover
                .frame(width: 280, height: 300)
                .presentationCompactAdaptation(.popover)
        }
        .task { await contextService.loadContextsIfNeeded() }
    }

    private func platformChip(
        name: String,
        icon: String,
        isSelected: Bool,
        platformColor: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isSelected ? .white : (platformColor ?? textSecondary))
                Text(name)
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(isSelected ? .white : textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .liquidGlassChip(isSelected: isSelected, accentColor: platformColor ?? accentColor)
        }
        .buttonStyle(.plain)
    }

    private var contextPickerPopover: some View {
        NavigationStack {
            List(contextService.contexts) { context in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        attachedContext = context
                    }
                    showContextPicker = false
                    triggerHaptic(.light)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: context.isGlobal ? "globe" : "folder.fill")
                            .foregroundStyle(accentColor)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.name)
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(textPrimary)
                            if let desc = context.description, !desc.isEmpty {
                                Text(desc)
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(textSecondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                        if attachedContext?.id == context.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(accentColor)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Attach Context")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Post-Enhancement Actions

    private var postEnhancementActions: some View {
        HStack(spacing: 8) {
            // Generate Variations (Pro+)
            Button {
                if storeKit.currentTier == .free {
                    triggerHaptic(.warning)
                    showPaywall = true
                } else {
                    triggerHaptic(.light)
                    showVariations = true
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.on.rectangle")
                        .font(.system(size: 12, weight: .semibold))
                    Text("Variations")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                    if storeKit.currentTier == .free {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 8, weight: .bold))
                    }
                }
                .foregroundStyle(textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
            .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

            // Platform Optimize (Pro+, shown if platform selected)
            if let platform = selectedPlatform {
                Button {
                    if storeKit.currentTier == .free {
                        triggerHaptic(.warning)
                        showPaywall = true
                    } else {
                        triggerHaptic(.light)
                        showPlatforms = true
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: platform.icon)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(hex: platform.color))
                        Text("Optimize")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                        if storeKit.currentTier == .free {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 8, weight: .bold))
                        }
                    }
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
                .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))
                .transition(.scale.combined(with: .opacity))
            }

            // Sandbox Test (Premium)
            Button {
                if storeKit.currentTier != .premium {
                    triggerHaptic(.warning)
                    showPaywall = true
                } else {
                    triggerHaptic(.light)
                    showSandbox = true
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "flask")
                        .font(.system(size: 12, weight: .semibold))
                    Text("Test")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                    if storeKit.currentTier != .premium {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 8, weight: .bold))
                    }
                }
                .foregroundStyle(textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
            .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

            Spacer()
        }
        .animation(.spring(response: 0.3), value: selectedPlatform?.rawValue)
    }

    private var inputView: some View {
        ZStack {
            // Main input container with embedded toolbar
            VStack(spacing: 0) {
                // Text editor area
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $viewModel.userPrompt)
                        .font(.system(.body, design: .default))
                        .foregroundStyle(textPrimary)
                        .frame(minHeight: 140, maxHeight: 260)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 8)
                        .scrollContentBackground(.hidden)
                        .focused($isTextEditorFocused)
                        .opacity(isTransforming ? 0.3 : 1.0)
                        .blur(radius: isTransforming ? 3 : 0)

                    if viewModel.userPrompt.isEmpty && !isTransforming {
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
            .liquidGlassInput(cornerRadius: 16, isFocused: isTextEditorFocused)

            // Pulsing logo overlay during transformation
            if isTransforming {
                VStack(spacing: 16) {
                    // App logo with pulsing animation
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
    }

    // MARK: - Input Toolbar (Embedded Controls)

    private var isPremium: Bool {
        storeKit.currentTier == .premium || storeKit.currentTier == .pro
    }

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

    private var maxModeRemaining: Int {
        maxModeLimit - maxModeUsedToday
    }

    private var canUseMaxMode: Bool {
        storeKit.currentTier == .premium || (storeKit.currentTier == .pro && maxModeRemaining > 0)
    }

    private func incrementMaxModeUsage() {
        let defaults = UserDefaults(suiteName: "group.com.res.promptomizer")
        let today = formattedDate(Date())
        defaults?.set(["date": today, "count": maxModeUsedToday + 1], forKey: "maxModeUsage")
    }

    private var inputToolbar: some View {
        HStack(spacing: 8) {
            // Modality selector (compact)
            CompactModalitySelector(
                selectedModality: Binding(
                    get: { settings.selectedModality },
                    set: { newValue in
                        settings.selectedModality = newValue
                        settings.savePreferences()
                    }
                )
            )

            // Audio sub-modality selector (only shown when audio is selected)
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

            // Tone selector (compact)
            CompactToneSelector(
                selectedTone: Binding(
                    get: { settings.selectedTone },
                    set: { newValue in
                        settings.selectedTone = newValue
                        settings.savePreferences()
                    }
                )
            )

            // Length selector (compact)
            CompactLengthSelector(selectedLength: Binding(
                get: { settings.outputLength },
                set: { newValue in
                    settings.outputLength = newValue
                    settings.savePreferences()
                }
            ))

            Spacer()

            // MAX Mode toggle (compact inline)
            maxModeInlineToggle

            // Deep Think toggle (compact inline)
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

    // MARK: - Compact MAX Mode Toggle (Inline)

    private var maxModeInlineToggle: some View {
        Button {
            // If trying to enable and can't use it
            if !settings.maxModeEnabled && !canUseMaxMode {
                showPaywall = true
                return
            }

            // Toggle MAX Mode
            withAnimation(.spring(response: 0.3)) {
                settings.maxModeEnabled.toggle()
                settings.savePreferences()
            }
            triggerHaptic(.light)

            // Show info popup when enabling MAX Mode
            if settings.maxModeEnabled {
                showMaxModeInfo = true
                // Auto-hide after 3 seconds
                Task {
                    try? await Task.sleep(for: .seconds(3))
                    withAnimation(.easeOut(duration: 0.3)) {
                        showMaxModeInfo = false
                    }
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

                // Show lock for free users, remaining count for Pro
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

    // MARK: - Compact Deep Think Toggle (Inline)

    private var deepThinkInlineToggle: some View {
        Button {
            if !isPremium && !settings.deepThinkEnabled {
                showPaywall = true
            } else {
                withAnimation(.spring(response: 0.3)) {
                    settings.deepThinkEnabled.toggle()
                    settings.savePreferences()
                }
                triggerHaptic(.light)

                // Show info popup when enabling Deep Think
                if settings.deepThinkEnabled {
                    showDeepThinkInfo = true
                    // Auto-hide after 3 seconds
                    Task {
                        try? await Task.sleep(for: .seconds(3))
                        withAnimation(.easeOut(duration: 0.3)) {
                            showDeepThinkInfo = false
                        }
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

    private var enhancedPromptView: some View {
        VStack(spacing: 16) {
            // Enhanced prompt text
            VStack(alignment: .leading, spacing: 0) {
                ScrollView {
                    Text(viewModel.enhancedPrompt)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(textPrimary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 180, maxHeight: 300)
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

            // Action buttons row
            VStack(spacing: 12) {
                // Primary action - Copy button (prominent glass)
                Button {
                    triggerHaptic(.light)
                    viewModel.copyToClipboard()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "doc.on.doc.fill")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Copy Prompt")
                            .font(.system(.body, design: .rounded, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(colorScheme == .dark ? .black : .white)
                }
                .buttonStyle(LiquidGlassButtonStyle(cornerRadius: 12, tintColor: colorScheme == .dark ? accentColor : Color.brandPurple, intensity: .prominent))

                // Secondary actions row - AI services (glass style)
                HStack(spacing: 8) {
                    // Try in Claude - glass with terracotta tint
                    Button {
                        triggerHaptic(.light)
                        openInClaude()
                    } label: {
                        Label("Claude", systemImage: "bubble.left.and.text.bubble.right")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(LiquidGlassButtonStyle(
                        cornerRadius: 12,
                        tintColor: Color(red: 0.85, green: 0.47, blue: 0.34), // #D97757
                        intensity: .standard
                    ))

                    // Try in ChatGPT - glass with teal tint
                    Button {
                        triggerHaptic(.light)
                        openInChatGPT()
                    } label: {
                        Label("ChatGPT", systemImage: "bubble.left.and.bubble.right")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(LiquidGlassButtonStyle(
                        cornerRadius: 12,
                        tintColor: Color(red: 0.0, green: 0.65, blue: 0.65), // Teal
                        intensity: .standard
                    ))
                }

                // Tertiary row - Favorite, Share and Clear (glass style)
                HStack(spacing: 10) {
                    // Favorite button - star turns yellow when saved
                    Button {
                        triggerHaptic(.light)
                        toggleCurrentPromptFavorite()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: viewModel.isCurrentPromptFavorite ? "star.fill" : "star")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(viewModel.isCurrentPromptFavorite ? .yellow : textSecondary)
                            Text(viewModel.isCurrentPromptFavorite ? "Saved" : "Save")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

                    ShareLink(item: viewModel.enhancedPrompt) {
                        HStack(spacing: 6) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 14, weight: .medium))
                            Text("Share")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .foregroundStyle(textSecondary)
                    }
                    .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

                    Button {
                        triggerHaptic(.light)
                        clearAndReset()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14, weight: .medium))
                            Text("Clear")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .foregroundStyle(textSecondary)
                    }
                    .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))
                }
            }
        }
    }

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

                    // Platform optimization requires Pro+
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

    private func performEnhancement() {
        Task {
            // Check MAX MODE quota for Pro users before enhancement
            if settings.maxModeEnabled && storeKit.currentTier == .pro && maxModeRemaining <= 0 {
                viewModel.errorMessage = "MAX MODE limit reached. Upgrade to Premium for unlimited MAX prompts."
                viewModel.showError = true
                settings.maxModeEnabled = false
                settings.savePreferences()
                return
            }

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

            // Build platform-aware custom instructions
            if selectedPlatform != nil || attachedContext != nil {
                var extraInstructions: [String] = []

                if let platform = selectedPlatform {
                    extraInstructions.append("Optimize this prompt specifically for \(platform.displayName). Follow \(platform.displayName)'s best practices, formatting conventions, and parameter syntax.")
                }

                if let context = attachedContext {
                    let contextDataStr = context.contextData.map { "\($0.key): \($0.value)" }.joined(separator: ", ")
                    if !contextDataStr.isEmpty {
                        extraInstructions.append("Use the following context data: \(contextDataStr)")
                    }
                }

                if !extraInstructions.isEmpty {
                    let existing = settings.customInstructions
                    let combined = extraInstructions.joined(separator: ". ")
                    settings.customInstructions = existing.isEmpty ? combined : "\(existing). \(combined)"
                    await viewModel.enhancePrompt(settings: settings)
                    settings.customInstructions = existing // Restore original
                } else {
                    await viewModel.enhancePrompt(settings: settings)
                }
            } else {
                await viewModel.enhancePrompt(settings: settings)
            }

            if viewModel.hasEnhancedPrompt {
                withAnimation { transformationPhase = .complete }

                // Track MAX MODE usage for Pro users
                if settings.maxModeEnabled && storeKit.currentTier == .pro {
                    incrementMaxModeUsage()
                }

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
                    // Store the prompt ID for favorite toggle
                    viewModel.setCurrentPromptId(savedPrompt.id)
                }

                // Refresh subscription usage after successful enhancement
                await storeKit.syncWithBackend()

                // Track enhancement count and potentially request review
                enhancementCount += 1
                checkReviewPrompt()
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
            viewModel.clearAll()
        }
    }

    private func toggleCurrentPromptFavorite() {
        guard let promptId = viewModel.currentPromptId else { return }

        // Optimistic UI update
        viewModel.isCurrentPromptFavorite.toggle()

        // Find the prompt in history and toggle its favorite status
        if let prompt = historyManager.prompts.first(where: { $0.id == promptId }) {
            Task {
                await historyManager.toggleFavorite(prompt)
            }
        }
    }

    // MARK: - Error Action Handling

    private func handleErrorAction(_ action: ErrorAction) {
        switch action {
        case .retry:
            // Retry the last action if applicable
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
            // Just dismiss - user can check network settings
            triggerHaptic(.warning)
        case .refreshApp:
            Task {
                await storeKit.syncWithBackend()
            }
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
        // Don't show on very first install (no previous version stored)
        guard !lastSeenWhatsNewVersion.isEmpty else {
            lastSeenWhatsNewVersion = currentAppVersion
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            showWhatsNew = true
        }
    }

    // MARK: - Paywall Reminder Logic

    /// Check if we should show paywall on first app launch after login
    private func checkPaywallReminder() {
        // Show onboarding paywall for first-time users (after login)
        if !hasSeenOnboardingPaywall && authManager.isAuthenticated {
            // Small delay to let the UI settle
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                showPaywall = true
                hasSeenOnboardingPaywall = true
                updateLastPaywallShownDate()
            }
        }
    }

    /// Check if we should show daily paywall reminder for free users
    private func checkDailyPaywallReminder() {
        // Only show for free tier users
        guard storeKit.currentTier == .free else { return }

        // Check if we've already shown today
        let today = formattedDate(Date())
        guard lastPaywallShownDateString != today else { return }

        // Don't show immediately on app launch - wait a bit
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            // Double-check user is still free tier (they might have subscribed)
            if storeKit.currentTier == .free {
                showPaywall = true
                updateLastPaywallShownDate()
            }
        }
    }

    /// Update the last paywall shown date to today
    private func updateLastPaywallShownDate() {
        lastPaywallShownDateString = formattedDate(Date())
    }

    /// Format date as YYYY-MM-DD string for comparison
    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    // MARK: - App Review Prompt Logic

    /// Check if we should request an app review
    private func checkReviewPrompt() {
        // Only prompt after user has done at least 3 enhancements
        guard enhancementCount >= 3 else { return }

        // Check if 3 days have passed since last prompt
        let today = Date()
        if let lastPromptDate = parseDate(lastReviewPromptDateString) {
            let daysSinceLastPrompt = Calendar.current.dateComponents([.day], from: lastPromptDate, to: today).day ?? 0
            guard daysSinceLastPrompt >= 3 else { return }
        }

        // Request review after a short delay (better UX after successful enhancement)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            requestAppReview()
            lastReviewPromptDateString = formattedDate(today)
        }
    }

    /// Request app store review using StoreKit
    private func requestAppReview() {
        if let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) {
            SKStoreReviewController.requestReview(in: windowScene)
        }
    }

    /// Parse date string back to Date
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
                    .foregroundStyle(.white)
                    .frame(minWidth: 16, minHeight: 16)
                    .background(isOnline ? Color.brandCyan : .orange)
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background {
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay {
                    Capsule()
                        .stroke(
                            isOnline ? Color.brandCyan.opacity(0.3) : Color.orange.opacity(0.3),
                            lineWidth: 1
                        )
                }
        }
        .animation(.spring(response: 0.3), value: pendingCount)
        .animation(.spring(response: 0.3), value: isSyncing)
    }
}
