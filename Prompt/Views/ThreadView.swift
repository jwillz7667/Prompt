//
//  ThreadView.swift
//  Prompt
//
//  Primary chat workspace for prompt optimization threads.
//

import SwiftUI
import PhotosUI
import UIKit

struct ThreadView: View {
    enum PresentationStyle {
        case home
        case detail
    }

    @Environment(\.colorScheme) private var colorScheme
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(GuestSessionManager.self) private var guestSession
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(AuthManager.self) private var authManager

    @Bindable var viewModel: ThreadViewModel
    var threadId: String?
    var presentationStyle: PresentationStyle = .detail
    var onOpenThreads: (() -> Void)? = nil
    var onOpenProfile: (() -> Void)? = nil
    var onOpenHistory: (() -> Void)? = nil
    var onOpenSettings: (() -> Void)? = nil
    var onOpenPaywall: (() -> Void)? = nil
    var onStartNewConversation: (() -> Void)? = nil

    @State private var expandedPowerTool: PowerToolsSection.PowerTool?
    @State private var showFullVariations = false
    @State private var showSandbox = false
    @State private var showWorkflows = false
    @State private var showPaywallSheet = false
    @State private var showWorkspaceActions = false
    @State private var showAttachmentActions = false
    @State private var showPhotoPicker = false
    @State private var showMaxModeToast = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @FocusState private var isInputFocused: Bool

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var backgroundPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var backgroundTertiary: Color { Color.adaptiveBackgroundTertiary }
    private var accentColor: Color { Color.adaptiveButtonPrimary }
    private var brandSecondaryAccent: Color { colorScheme == .dark ? Color.brandPurple : Color.brandPurpleDark }

    private var canUseMaxMode: Bool {
        guard authManager.isAuthenticated else {
            return guestSession.quota.maxRemaining > 0
        }

        guard let remaining = storeKit.usageInfo?.maxModeRemaining else { return true }
        return remaining != 0
    }

    private var latestPromptForTools: String? {
        guard !viewModel.isStreaming else { return nil }
        return viewModel.latestEnhancedPrompt
    }

    private var isHomeWelcomeState: Bool {
        presentationStyle == .home && !viewModel.hasConversation
    }

    private var modalitySummary: String {
        settings.selectedModality.displayName
    }

    private var inputPlaceholder: String {
        viewModel.hasConversation ? "Reply with another optimization request" : "Ask Promptomize"
    }

    var body: some View {
        Group {
            if presentationStyle == .detail {
                threadSurface
                    .navigationTitle(viewModel.threadTitle)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            } else {
                threadSurface
            }
        }
        .background { LiquidGlassBackground() }
        .overlay(alignment: .top) {
            if showMaxModeToast {
                maxModeToast
                    .padding(.top, presentationStyle == .home ? 92 : 18)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            composerInset
        }
        .task {
            if let threadId {
                await viewModel.loadThread(id: threadId)
            }
        }
        .sheet(isPresented: $showPaywallSheet) {
            PaywallView()
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
        .sheet(isPresented: $showFullVariations) {
            VariationsView(promptText: latestPromptForTools ?? viewModel.userPrompt)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
        }
        .confirmationDialog("Workspace", isPresented: $showWorkspaceActions, titleVisibility: .visible) {
            if let onStartNewConversation, viewModel.hasConversation {
                Button("New Chat") {
                    triggerHaptic(.light)
                    onStartNewConversation()
                }
            }

            if let onOpenThreads {
                Button("History") {
                    triggerHaptic(.light)
                    onOpenThreads()
                }
            }

            if let onOpenHistory {
                Button("History") {
                    triggerHaptic(.light)
                    onOpenHistory()
                }
            }

            if let onOpenSettings {
                Button("Profile & Settings") {
                    triggerHaptic(.light)
                    onOpenSettings()
                }
            }

            Button("Plans & Usage") {
                presentPaywall()
            }
        }
        .confirmationDialog("Image Reference", isPresented: $showAttachmentActions, titleVisibility: .visible) {
            Button(viewModel.selectedImageAttachment == nil ? "Choose Image" : "Replace Image") {
                showPhotoPicker = true
            }

            if viewModel.selectedImageAttachment != nil {
                Button("Remove Image", role: .destructive) {
                    removeSelectedImage()
                }
            }
        }
        .photosPicker(
            isPresented: $showPhotoPicker,
            selection: $selectedPhotoItem,
            matching: .images,
            preferredItemEncoding: .compatible
        )
        .alert("Error", isPresented: $viewModel.showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "An unknown error occurred")
        }
        .onChange(of: selectedPhotoItem) { _, newItem in
            guard let newItem else { return }
            Task {
                await handleSelectedPhotoItem(newItem)
                selectedPhotoItem = nil
            }
        }
        .onChange(of: viewModel.showPaywall) { _, shouldShow in
            guard shouldShow else { return }
            presentPaywall()
            viewModel.showPaywall = false
        }
    }

    private var threadSurface: some View {
        VStack(spacing: 0) {
            if presentationStyle == .home {
                workspaceHeader
            }

            messagesArea
        }
    }

    // MARK: - Header

    private var workspaceHeader: some View {
        HStack(spacing: 12) {
            iconButton(systemName: "line.3.horizontal", action: {
                triggerHaptic(.light)
                onOpenThreads?()
            })

            AppBrandMark(size: 48, showsGlassBackdrop: false)

            Spacer(minLength: 0)

            if storeKit.currentTier != .premium {
                Button {
                    triggerHaptic(.light)
                    presentPaywall()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Premium")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                    }
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                }
                .buttonStyle(GlassCapsuleButtonStyle(tintColor: accentColor, intensity: .prominent))
            }

            if let onStartNewConversation, viewModel.hasConversation {
                iconButton(systemName: "square.and.pencil", action: {
                    triggerHaptic(.light)
                    onStartNewConversation()
                })
            }

            if let onOpenHistory {
                iconButton(systemName: "clock.arrow.circlepath", action: {
                    triggerHaptic(.light)
                    onOpenHistory()
                })
            }

            profileButton
        }
        .padding(16)
        .liquidGlass(cornerRadius: 28, shadowIntensity: 0.65, borderGlow: true)
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private func statusChip(title: String, systemImage: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 11, weight: .semibold))
                Text(title)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(textPrimary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .buttonStyle(GlassCapsuleButtonStyle(tintColor: tint.opacity(0.9), intensity: .subtle))
    }

    private func iconButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(textPrimary)
        }
        .buttonStyle(GlassIconButtonStyle(size: 40))
    }

    private var profileButton: some View {
        Button {
            triggerHaptic(.light)
            onOpenProfile?()
        } label: {
            Group {
                if let avatarUrl = authManager.currentUser?.avatarUrl,
                   let url = URL(string: avatarUrl) {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        Image(systemName: "person.crop.circle")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(textPrimary)
                    }
                } else {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(textPrimary)
                }
            }
            .frame(width: 40, height: 40)
            .clipShape(Circle())
        }
        .buttonStyle(GlassIconButtonStyle(size: 40))
    }

    // MARK: - Messages

    @ViewBuilder
    private var messagesArea: some View {
        if isHomeWelcomeState {
            welcomeState
        } else {
            conversationMessagesArea
        }
    }

    private var welcomeState: some View {
        VStack {
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var conversationMessagesArea: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    ForEach(viewModel.turnMessages) { message in
                        messageRow(message)
                    }

                    if viewModel.isStreaming && viewModel.streamingContent.isEmpty {
                        processingIndicator
                            .id("processing")
                    }

                    if let prompt = latestPromptForTools {
                        powerToolsRow(prompt)
                    }

                    Color.clear
                        .frame(height: 4)
                        .id("thread-bottom")
                }
                .padding(.horizontal, 16)
                .padding(.top, presentationStyle == .home ? 8 : 16)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: viewModel.turnMessages.count) { _, _ in
                withAnimation(.spring(response: 0.34, dampingFraction: 0.84)) {
                    proxy.scrollTo("thread-bottom", anchor: .bottom)
                }
            }
            .onChange(of: viewModel.streamingContent) { _, _ in
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo("thread-bottom", anchor: .bottom)
                }
            }
            .onChange(of: latestPromptForTools) { _, _ in
                withAnimation(.spring(response: 0.34, dampingFraction: 0.84)) {
                    proxy.scrollTo("power-tools", anchor: .bottom)
                }
            }
        }
    }

    private var processingIndicator: some View {
        HStack {
            HStack(spacing: 8) {
                ProgressView()
                    .scaleEffect(0.8)
                Text("Optimizing...")
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .liquidGlass(cornerRadius: 18, shadowIntensity: 0.45)

            Spacer(minLength: 60)
        }
    }

    private func messageRow(_ message: ThreadMessage) -> some View {
        ThreadMessageBubble(
            message: message,
            isStreaming: viewModel.isStreaming && message.id == "streaming"
        )
        .id(message.id)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func powerToolsRow(_ prompt: String) -> some View {
        PowerToolsSection(
            expandedTool: $expandedPowerTool,
            enhancedPrompt: prompt,
            onApplyPrompt: { newPrompt in
                withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                    viewModel.userPrompt = newPrompt
                }
                isInputFocused = true
                triggerHaptic(.medium)
            },
            onShowPaywall: {
                presentPaywall()
            },
            onOpenSheet: { tool in
                handlePowerToolSheet(tool)
            }
        )
        .id("power-tools")
        .transition(.opacity.combined(with: .scale(scale: 0.98)))
    }

    // MARK: - Composer

    private var composerInset: some View {
        HStack(alignment: .bottom, spacing: 12) {
            Button {
                triggerHaptic(.light)
                showAttachmentActions = true
            } label: {
                Image(systemName: viewModel.selectedImageAttachment == nil ? "plus" : "photo.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(textPrimary)
            }
            .buttonStyle(GlassIconButtonStyle(size: 56))

            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 10) {
                    if let attachment = viewModel.selectedImageAttachment {
                        VStack(alignment: .leading, spacing: 8) {
                            PromptImageAttachmentCard(
                                attachment: attachment,
                                height: 134,
                                showsAnalysisBadge: false,
                                onRemove: removeSelectedImage
                            )
                            .frame(height: 134)

                            Text("This image will be analyzed and turned into a video-ready prompt.")
                                .font(.system(.caption, design: .rounded, weight: .medium))
                                .foregroundStyle(textSecondary)
                        }
                    }

                    ZStack(alignment: .leading) {
                        if viewModel.userPrompt.isEmpty {
                            Text(viewModel.selectedImageAttachment == nil ? inputPlaceholder : "Describe the motion, camera, or style you want...")
                                .font(.system(.body, design: .rounded))
                                .foregroundStyle(textTertiary)
                                .allowsHitTesting(false)
                        }

                        TextField("", text: $viewModel.userPrompt, axis: .vertical)
                            .font(.system(.body, design: .rounded))
                            .foregroundStyle(textPrimary)
                            .lineLimit(1...5)
                            .textFieldStyle(.plain)
                            .focused($isInputFocused)
                            .submitLabel(.send)
                            .onSubmit {
                                if viewModel.canSend {
                                    submitPrompt()
                                }
                            }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        isInputFocused = true
                    }

                    HStack(spacing: 8) {
                        Menu {
                            ForEach(ModalityType.allCases) { modality in
                                Button(modality.displayName) {
                                    applyModality(modality)
                                }
                            }
                        } label: {
                            composerControlChip(
                                title: modalitySummary,
                                systemImage: settings.selectedModality.icon,
                                tint: brandSecondaryAccent
                            )
                        }
                        .buttonStyle(.plain)

                        if settings.selectedModality == .audio {
                            Menu {
                                ForEach(AudioSubModalityType.allCases) { subModality in
                                    Button(subModality.displayName) {
                                        applyAudioSubModality(subModality)
                                    }
                                }
                            } label: {
                                composerControlChip(
                                    title: settings.selectedAudioSubModality.displayName,
                                    systemImage: settings.selectedAudioSubModality.icon,
                                    tint: accentColor
                                )
                            }
                            .buttonStyle(.plain)
                        }

                        Button(action: toggleMaxMode) {
                            composerControlChip(
                                title: settings.maxModeEnabled ? "MAX" : "Standard",
                                systemImage: settings.maxModeEnabled ? "flame.fill" : "bolt.fill",
                                tint: settings.maxModeEnabled ? .orange : accentColor,
                                isSelected: settings.maxModeEnabled
                            )
                        }
                        .buttonStyle(.plain)

                        Spacer(minLength: 0)

                        if !viewModel.userPrompt.isEmpty {
                            Text("\(viewModel.userPrompt.count)")
                                .font(.system(.caption, design: .rounded, weight: .medium))
                                .foregroundStyle(textSecondary)
                                .contentTransition(.numericText())
                        }
                    }
                }

                Button(action: submitPrompt) {
                    ZStack {
                        Circle()
                            .fill(viewModel.canSend ? accentColor : backgroundTertiary)

                        if viewModel.isStreaming {
                            ProgressView()
                                .tint(viewModel.canSend ? Color.adaptiveTextOnAccent : textSecondary)
                                .scaleEffect(0.85)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(viewModel.canSend ? Color.adaptiveTextOnAccent : textSecondary)
                        }
                    }
                    .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .disabled(!viewModel.canSend)
            }
            .frame(minHeight: 56)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .liquidGlassInput(cornerRadius: 28, isFocused: isInputFocused)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, presentationStyle == .home ? 12 : 8)
        .background {
            Rectangle()
                .fill(backgroundPrimary.opacity(colorScheme == .dark ? 0.92 : 0.85))
                .background(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
        }
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: viewModel.canSend)
    }

    // MARK: - Actions

    private func presentPaywall() {
        if let onOpenPaywall {
            onOpenPaywall()
        } else {
            showPaywallSheet = true
        }
    }

    private func handlePowerToolSheet(_ tool: PowerToolsSection.PowerTool) {
        switch tool {
        case .variations:
            showFullVariations = true
        case .sandbox:
            showSandbox = true
        case .workflows:
            showWorkflows = true
        }
    }

    private func submitPrompt() {
        guard viewModel.canSend else { return }

        triggerHaptic(.medium)
        isInputFocused = false

        if settings.maxModeEnabled && !canUseMaxMode {
            settings.maxModeEnabled = false
            settings.savePreferences()
            presentPaywall()
            return
        }

        Task {
            await viewModel.addTurn(settings: settings, historyManager: historyManager)
            await storeKit.syncWithBackend()
        }
    }

    private func applyModality(_ modality: ModalityType) {
        settings.selectedModality = modality
        settings.savePreferences()
        triggerHaptic(.light)
    }

    private func applyAudioSubModality(_ subModality: AudioSubModalityType) {
        settings.selectedAudioSubModality = subModality
        settings.savePreferences()
        triggerHaptic(.light)
    }

    private func toggleMaxMode() {
        if !authManager.isAuthenticated && !settings.maxModeEnabled && guestSession.quota.maxRemaining == 0 {
            if guestSession.quota.isExhausted {
                guestSession.presentAuthenticationGate()
                viewModel.errorMessage = "Sign in to keep using MAX mode and continue your chat."
            } else {
                viewModel.errorMessage = "Your guest MAX prompt is already used. Switch back to Standard or sign in to continue."
            }
            viewModel.showError = true
            return
        }

        if !settings.maxModeEnabled && !canUseMaxMode {
            presentPaywall()
            return
        }

        settings.maxModeEnabled.toggle()
        settings.savePreferences()
        triggerHaptic(.light)

        if settings.maxModeEnabled {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                showMaxModeToast = true
            }

            Task {
                try? await Task.sleep(for: .seconds(1.35))
                await MainActor.run {
                    withAnimation(.spring(response: 0.26, dampingFraction: 0.9)) {
                        showMaxModeToast = false
                    }
                }
            }
        } else {
            withAnimation(.easeOut(duration: 0.18)) {
                showMaxModeToast = false
            }
        }
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    private func composerControlChip(title: String, systemImage: String, tint: Color, isSelected: Bool = false) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 11, weight: .semibold))
            Text(title)
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(textPrimary)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .liquidGlassChip(isSelected: isSelected, accentColor: tint)
    }

    private var maxModeToast: some View {
        HStack(spacing: 8) {
            Image(systemName: "flame.fill")
                .font(.system(size: 12, weight: .bold))
            Text("MAX mode on")
                .font(.system(.caption, design: .rounded, weight: .bold))
        }
        .foregroundStyle(Color.adaptiveTextOnAccent)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            Capsule()
                .fill(
                    LinearGradient(
                        colors: [Color.orange, Color.orange.opacity(0.82)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .shadow(color: Color.orange.opacity(0.28), radius: 14, y: 8)
    }

    private func handleSelectedPhotoItem(_ item: PhotosPickerItem) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw ImageAttachmentProcessorError.failedToLoad
            }

            let attachment = try ImageAttachmentProcessor.process(data: data)
            await MainActor.run {
                viewModel.selectedImageAttachment = attachment
                if settings.selectedModality != .video {
                    settings.selectedModality = .video
                    settings.savePreferences()
                }
                triggerHaptic(.light)
                isInputFocused = true
            }
        } catch {
            await MainActor.run {
                viewModel.errorMessage = error.localizedDescription
                viewModel.showError = true
            }
        }
    }

    private func removeSelectedImage() {
        viewModel.selectedImageAttachment = nil
        triggerHaptic(.light)
    }
}
