//
//  ThreadView.swift
//  Prompt
//
//  Primary chat workspace for prompt optimization threads.
//

import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

struct ThreadView: View {
    enum PresentationStyle {
        case home
        case detail
    }

    private enum ComposerDrawer {
        case modalities
        case attachments
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
    var onOpenPaywall: (() -> Void)? = nil
    var onStartNewConversation: (() -> Void)? = nil

    @State private var showPaywallSheet = false
    @State private var showWorkspaceActions = false
    @State private var showPhotoPicker = false
    @State private var showTextFileImporter = false
    @State private var showCameraCapture = false
    @State private var showMaxModeToast = false
    @State private var activeComposerDrawer: ComposerDrawer?
    @State private var composerOverlayHeight: CGFloat = 164
    @State private var selectedPhotoItem: PhotosPickerItem?
    @FocusState private var isInputFocused: Bool

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
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

    private var conversationMode: ThreadConversationMode {
        settings.conversationMode
    }

    private var floatingControlSize: CGFloat { 44 }

    private var topMessageInset: CGFloat {
        presentationStyle == .home ? 82 : 16
    }

    private var bottomMessageInset: CGFloat {
        max(composerOverlayHeight + 8, 156)
    }

    private var hasActiveComposerOptions: Bool {
        settings.conversationMode != .optimize ||
        settings.selectedModality != .text ||
        settings.maxModeEnabled ||
        (settings.selectedModality == .audio && settings.selectedAudioSubModality != .speech)
    }

    private var isComposerExpanded: Bool {
        isInputFocused || !viewModel.userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var shouldShowSendButton: Bool {
        viewModel.canSend
    }

    private var inputPlaceholder: String {
        switch conversationMode {
        case .optimize:
            return viewModel.hasConversation
                ? "Reply with another optimization request"
                : "Ask Promptomize to rewrite your prompt"
        case .chat:
            return viewModel.hasConversation
                ? "Continue the conversation"
                : "Ask Promptomize anything"
        }
    }

    private var imagePromptPlaceholder: String {
        switch conversationMode {
        case .optimize:
            return "Describe the motion, camera, or style you want..."
        case .chat:
            return "Ask about the image or tell Promptomize how to help..."
        }
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
                    .padding(.top, presentationStyle == .home ? 104 : 18)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
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
        .confirmationDialog("Workspace", isPresented: $showWorkspaceActions, titleVisibility: .visible) {
            if let onStartNewConversation, viewModel.hasConversation {
                Button("New Chat") {
                    triggerHaptic(.light)
                    onStartNewConversation()
                }
            }

            if let historyAction = onOpenHistory ?? onOpenThreads {
                Button("History") {
                    triggerHaptic(.light)
                    historyAction()
                }
            }

            if let onOpenProfile {
                Button("Profile & Settings") {
                    triggerHaptic(.light)
                    onOpenProfile()
                }
            }

            Button("Plans & Usage") {
                presentPaywall()
            }
        }
        .photosPicker(
            isPresented: $showPhotoPicker,
            selection: $selectedPhotoItem,
            matching: .images,
            preferredItemEncoding: .compatible
        )
        .fileImporter(
            isPresented: $showTextFileImporter,
            allowedContentTypes: [.text, .plainText, .utf8PlainText, .sourceCode, .json]
        ) { result in
            handleImportedTextFile(result)
        }
        .sheet(isPresented: $showCameraCapture) {
            CameraImagePicker(sourceType: .camera) { image in
                handleCapturedImage(image)
            }
            .ignoresSafeArea()
        }
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
        .onChange(of: viewModel.hasConversation) { _, hasConversation in
            guard !hasConversation else { return }
            withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                activeComposerDrawer = nil
            }
        }
        .onPreferenceChange(ThreadComposerOverlayHeightPreferenceKey.self) { newHeight in
            guard newHeight > 0 else { return }
            composerOverlayHeight = newHeight
        }
    }

    private var threadSurface: some View {
        messagesArea
            .overlay(alignment: .top) {
                if presentationStyle == .home {
                    floatingWorkspaceHeader
                }
            }
            .overlay(alignment: .bottom) {
                floatingComposerOverlay
            }
    }

    // MARK: - Header

    private var workspaceHeader: some View {
        HStack(spacing: 10) {
            iconButton(systemName: "line.3.horizontal", action: {
                triggerHaptic(.light)
                showWorkspaceActions = true
            })

            AppBrandMark(size: 28, showsGlassBackdrop: false)

            Spacer(minLength: 0)

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
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
    }

    private var floatingWorkspaceHeader: some View {
        VStack(spacing: 0) {
            workspaceHeader

            FloatingChromeFade(edge: .top)
                .frame(height: 58)
                .padding(.horizontal, 18)
                .allowsHitTesting(false)
        }
    }

    private func iconButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(textPrimary)
        }
        .buttonStyle(GlassIconButtonStyle(size: floatingControlSize))
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
                        .font(.system(size: 19, weight: .medium))
                        .foregroundStyle(textPrimary)
                }
            }
            .frame(width: floatingControlSize, height: floatingControlSize)
            .clipShape(Circle())
        }
        .buttonStyle(GlassIconButtonStyle(size: floatingControlSize))
    }

    // MARK: - Messages

    private var messagesArea: some View { conversationMessagesArea }

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

                    Color.clear
                        .frame(height: 4)
                        .id("thread-bottom")
                }
                .padding(.horizontal, 16)
                .padding(.top, topMessageInset)
                .padding(.bottom, bottomMessageInset)
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
        }
    }

    private var processingIndicator: some View {
        HStack {
            HStack(spacing: 8) {
                ProgressView()
                    .scaleEffect(0.8)
                Text(conversationMode == .chat ? "Thinking..." : "Optimizing...")
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

    // MARK: - Composer

    private var composerInset: some View {
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

                    Text(conversationMode == .chat
                         ? "This image will be analyzed and used as shared context for the conversation."
                         : "This image will be analyzed and turned into a stronger generation prompt.")
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                }
            }

            VStack(alignment: .leading, spacing: isComposerExpanded ? 14 : 10) {
                composerTextField

                HStack(spacing: 10) {
                    modalitiesInlineButton

                    Spacer(minLength: 0)

                    if shouldShowSendButton {
                        sendButton
                    }

                    attachmentInlineButton
                }
            }
            .frame(maxWidth: .infinity, minHeight: isComposerExpanded ? 108 : 78, alignment: .topLeading)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .liquidGlassInput(cornerRadius: 30, isFocused: isInputFocused)

            if let activeComposerDrawer {
                composerDrawer(for: activeComposerDrawer)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, presentationStyle == .home ? 14 : 10)
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: viewModel.canSend)
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: isComposerExpanded)
        .animation(.spring(response: 0.3, dampingFraction: 0.84), value: activeComposerDrawer != nil)
    }

    private var floatingComposerOverlay: some View {
        VStack(spacing: 0) {
            FloatingChromeFade(edge: .bottom)
                .frame(height: 86)
                .padding(.horizontal, 16)
                .allowsHitTesting(false)

            composerInset
        }
        .background {
            GeometryReader { proxy in
                Color.clear
                    .preference(key: ThreadComposerOverlayHeightPreferenceKey.self, value: proxy.size.height)
            }
        }
    }

    @ViewBuilder
    private func composerDrawer(for drawer: ComposerDrawer) -> some View {
        ScrollView(showsIndicators: false) {
            switch drawer {
            case .modalities:
                modalityDrawerContent
            case .attachments:
                attachmentDrawerContent
            }
        }
        .frame(maxHeight: drawer == .modalities ? 372 : 268)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .modifier(LiquidGlassModifier(cornerRadius: 26, material: .thin, shadowIntensity: 0.28, borderGlow: false))
    }

    private var attachmentDrawerColumns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)
    }

    private var modalityDrawerContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            drawerSectionHeader(
                title: "Response style",
                subtitle: "First choose how Promptomize should respond."
            )

            HStack(spacing: 10) {
                responseModeCard(.optimize, tint: accentColor)
                responseModeCard(.chat, tint: brandSecondaryAccent)
            }

            maxModeCard

            drawerSectionHeader(
                title: "Target output",
                subtitle: "Then choose what kind of prompt you want to generate."
            )

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 2), spacing: 10) {
                ForEach(ModalityType.allCases) { modality in
                    modalityTargetCard(modality)
                }
            }

            if settings.selectedModality == .audio {
                drawerSectionHeader(
                    title: "Audio focus",
                    subtitle: "Refine the audio prompt for the exact output you need."
                )

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 2), spacing: 10) {
                    ForEach(AudioSubModalityType.allCases) { subModality in
                        audioSubModalityCard(subModality)
                    }
                }
            }
        }
    }

    private var attachmentDrawerContent: some View {
        LazyVGrid(columns: attachmentDrawerColumns, spacing: 10) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                drawerActionTile(title: "Camera", systemImage: "camera") {
                    activeComposerDrawer = nil
                    showCameraCapture = true
                }
            }

            drawerActionTile(
                title: viewModel.selectedImageAttachment == nil ? "Photos" : "Replace",
                systemImage: "photo.on.rectangle"
            ) {
                activeComposerDrawer = nil
                showPhotoPicker = true
            }

            drawerActionTile(title: "Files", systemImage: "folder.badge.plus") {
                activeComposerDrawer = nil
                showTextFileImporter = true
            }

            if UIPasteboard.general.hasStrings {
                drawerActionTile(title: "Paste Text", systemImage: "doc.on.clipboard") {
                    activeComposerDrawer = nil
                    pasteClipboardText()
                }
            }

            if UIPasteboard.general.hasImages {
                drawerActionTile(title: "Paste Image", systemImage: "photo.badge.plus") {
                    activeComposerDrawer = nil
                    pasteClipboardImage()
                }
            }

            if viewModel.selectedImageAttachment != nil {
                drawerActionTile(title: "Remove", systemImage: "trash", tint: .red) {
                    activeComposerDrawer = nil
                    removeSelectedImage()
                }
            }
        }
    }

    private var modalitiesInlineButton: some View {
        Button {
            triggerHaptic(.light)
            toggleComposerDrawer(.modalities)
        } label: {
            ZStack(alignment: .topTrailing) {
                composerInlineButton(
                    systemImage: settings.selectedModality.icon,
                    tint: activeComposerDrawer == .modalities ? accentColor : textPrimary
                )

                if hasActiveComposerOptions {
                    Circle()
                        .fill(accentColor)
                        .frame(width: 7, height: 7)
                        .offset(x: 1, y: -1)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var attachmentInlineButton: some View {
        Button {
            triggerHaptic(.light)
            toggleComposerDrawer(.attachments)
        } label: {
            composerInlineButton(
                systemImage: viewModel.selectedImageAttachment == nil ? "plus" : "photo.fill",
                tint: viewModel.selectedImageAttachment == nil ? textPrimary : accentColor
            )
        }
        .buttonStyle(.plain)
    }

    private var composerTextField: some View {
        ZStack(alignment: .leading) {
            if viewModel.userPrompt.isEmpty {
                Text(viewModel.selectedImageAttachment == nil ? inputPlaceholder : imagePromptPlaceholder)
                    .font(.system(.body, design: .rounded, weight: .medium))
                    .foregroundStyle(textTertiary)
                    .allowsHitTesting(false)
            }

            TextField("", text: $viewModel.userPrompt, axis: .vertical)
                .font(.system(.body, design: .rounded, weight: .medium))
                .foregroundStyle(textPrimary)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .focused($isInputFocused)
                .submitLabel(.send)
                .onSubmit {
                    if viewModel.canSend {
                        submitPrompt()
                    }
                }
        }
        .frame(maxWidth: .infinity, minHeight: isComposerExpanded ? 40 : 24, alignment: .topLeading)
        .contentShape(Rectangle())
        .onTapGesture {
            activeComposerDrawer = nil
            isInputFocused = true
        }
    }

    private var sendButton: some View {
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
            .frame(width: floatingControlSize, height: floatingControlSize)
        }
        .buttonStyle(.plain)
        .disabled(!viewModel.canSend)
    }

    // MARK: - Actions

    private func presentPaywall() {
        if let onOpenPaywall {
            onOpenPaywall()
        } else {
            showPaywallSheet = true
        }
    }

    private func submitPrompt() {
        guard viewModel.canSend else { return }

        triggerHaptic(.medium)
        isInputFocused = false
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            activeComposerDrawer = nil
        }

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
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            activeComposerDrawer = nil
        }
        triggerHaptic(.light)
    }

    private func applyConversationMode(_ mode: ThreadConversationMode) {
        guard settings.conversationMode != mode else { return }
        settings.conversationMode = mode
        settings.savePreferences()
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            activeComposerDrawer = nil
        }
        triggerHaptic(.light)
    }

    private func applyAudioSubModality(_ subModality: AudioSubModalityType) {
        settings.selectedAudioSubModality = subModality
        settings.savePreferences()
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            activeComposerDrawer = nil
        }
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
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            activeComposerDrawer = nil
        }
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

    private func toggleComposerDrawer(_ drawer: ComposerDrawer) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.84)) {
            activeComposerDrawer = activeComposerDrawer == drawer ? nil : drawer
        }
    }

    private func drawerSectionHeader(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
                .textCase(.uppercase)
                .tracking(0.7)

            Text(subtitle)
                .font(.system(.caption, design: .rounded, weight: .medium))
                .foregroundStyle(textSecondary)
        }
    }

    private func responseModeCard(_ mode: ThreadConversationMode, tint: Color) -> some View {
        let isSelected = settings.conversationMode == mode

        return Button {
            applyConversationMode(mode)
        } label: {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Image(systemName: mode.icon)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(isSelected ? tint : textPrimary)

                    Spacer(minLength: 8)

                    Text(mode == .optimize ? "Rewrite" : "Direct")
                        .font(.system(.caption2, design: .rounded, weight: .bold))
                        .foregroundStyle(isSelected ? tint : textTertiary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background {
                            Capsule()
                                .fill(isSelected ? tint.opacity(colorScheme == .dark ? 0.18 : 0.14) : Color.white.opacity(colorScheme == .dark ? 0.06 : 0.4))
                        }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(mode.displayName)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)

                    Text(mode.shortDescription)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(isSelected ? tint.opacity(colorScheme == .dark ? 0.16 : 0.10) : Color.white.opacity(colorScheme == .dark ? 0.03 : 0.22))
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(
                        isSelected
                            ? tint.opacity(colorScheme == .dark ? 0.82 : 0.42)
                            : Color.white.opacity(colorScheme == .dark ? 0.12 : 0.28),
                        lineWidth: isSelected ? 1.6 : 1
                    )
            }
        }
        .buttonStyle(.plain)
    }

    private var maxModeCard: some View {
        Button {
            toggleMaxMode()
        } label: {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    Circle()
                        .fill((settings.maxModeEnabled ? Color.orange : accentColor).opacity(colorScheme == .dark ? 0.18 : 0.12))

                    Image(systemName: settings.maxModeEnabled ? "flame.fill" : "bolt.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(settings.maxModeEnabled ? Color.orange : accentColor)
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 4) {
                    Text(settings.maxModeEnabled ? "MAX quality" : "Standard quality")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)

                    Text(maxModeSupportingCopy)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                Text(settings.maxModeEnabled ? "On" : "Off")
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(settings.maxModeEnabled ? Color.adaptiveTextOnAccent : textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background {
                        Capsule()
                            .fill(settings.maxModeEnabled ? Color.orange : Color.white.opacity(colorScheme == .dark ? 0.08 : 0.46))
                    }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(settings.maxModeEnabled ? Color.orange.opacity(colorScheme == .dark ? 0.12 : 0.08) : Color.white.opacity(colorScheme == .dark ? 0.03 : 0.22))
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(
                        (settings.maxModeEnabled ? Color.orange : accentColor).opacity(colorScheme == .dark ? 0.48 : 0.26),
                        lineWidth: settings.maxModeEnabled ? 1.4 : 1
                    )
            }
        }
        .buttonStyle(.plain)
    }

    private var maxModeSupportingCopy: String {
        if settings.maxModeEnabled {
            return "Deeper reasoning for harder rewrites and more complex prompts."
        }

        if !authManager.isAuthenticated {
            let remaining = guestSession.quota.maxRemaining
            return remaining > 0
                ? "\(remaining) guest MAX turn\(remaining == 1 ? "" : "s") left."
                : "Sign in or upgrade to unlock more MAX turns."
        }

        if let remaining = storeKit.usageInfo?.maxModeRemaining, remaining > 0 {
            return "\(remaining) MAX turn\(remaining == 1 ? "" : "s") remaining in your current allowance."
        }

        return "Use MAX when you need stronger reasoning and tighter prompt structure."
    }

    private func modalityTargetCard(_ modality: ModalityType) -> some View {
        let tint = modalityAccentColor(for: modality)
        let isSelected = settings.selectedModality == modality

        return Button {
            applyModality(modality)
        } label: {
            VStack(alignment: .leading, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(tint.opacity(colorScheme == .dark ? 0.18 : 0.12))

                    Image(systemName: modality.icon)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(isSelected ? tint : textPrimary)
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 4) {
                    Text(modality.displayName)
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)

                    Text(modality.description)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(isSelected ? tint.opacity(colorScheme == .dark ? 0.14 : 0.10) : Color.white.opacity(colorScheme == .dark ? 0.03 : 0.18))
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(
                        isSelected
                            ? tint.opacity(colorScheme == .dark ? 0.78 : 0.42)
                            : Color.white.opacity(colorScheme == .dark ? 0.10 : 0.24),
                        lineWidth: isSelected ? 1.5 : 1
                    )
            }
        }
        .buttonStyle(.plain)
    }

    private func audioSubModalityCard(_ subModality: AudioSubModalityType) -> some View {
        let isSelected = settings.selectedAudioSubModality == subModality

        return Button {
            applyAudioSubModality(subModality)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: subModality.icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(isSelected ? brandSecondaryAccent : textPrimary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(subModality.displayName)
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)

                    Text(subModality.description)
                        .font(.system(.caption2, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 74, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(isSelected ? brandSecondaryAccent.opacity(colorScheme == .dark ? 0.12 : 0.08) : Color.white.opacity(colorScheme == .dark ? 0.02 : 0.16))
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(
                        isSelected
                            ? brandSecondaryAccent.opacity(colorScheme == .dark ? 0.68 : 0.34)
                            : Color.white.opacity(colorScheme == .dark ? 0.10 : 0.22),
                        lineWidth: isSelected ? 1.4 : 1
                    )
            }
        }
        .buttonStyle(.plain)
    }

    private func drawerActionTile(
        title: String,
        systemImage: String,
        tint: Color = .white,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            drawerTileContent(
                title: title,
                systemImage: systemImage,
                tint: tint,
                isSelected: false
            )
        }
        .buttonStyle(.plain)
    }

    private func drawerTileContent(
        title: String,
        systemImage: String,
        tint: Color,
        isSelected: Bool
    ) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(isSelected ? tint : textPrimary)

            Text(title)
                .font(.system(.subheadline, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 92)
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(isSelected ? tint.opacity(colorScheme == .dark ? 0.14 : 0.10) : Color.white.opacity(colorScheme == .dark ? 0.02 : 0.16))
                }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(
                    isSelected
                        ? tint.opacity(colorScheme == .dark ? 0.8 : 0.45)
                        : Color.white.opacity(colorScheme == .dark ? 0.10 : 0.28),
                    lineWidth: isSelected ? 1.5 : 1
                )
        }
    }

    private func modalityAccentColor(for modality: ModalityType) -> Color {
        switch modality {
        case .text:
            return accentColor
        case .image:
            return .pink
        case .video:
            return .red
        case .music:
            return .orange
        case .audio:
            return .teal
        case .code:
            return .green
        case .threeD:
            return .blue
        }
    }

    private func composerInlineButton(systemImage: String, tint: Color) -> some View {
        Image(systemName: systemImage)
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: floatingControlSize, height: floatingControlSize)
            .background {
                Circle()
                    .fill(.ultraThinMaterial)
                    .overlay {
                        Circle()
                            .stroke(Color.white.opacity(colorScheme == .dark ? 0.12 : 0.28), lineWidth: 1)
                    }
            }
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
                applyImageAttachment(attachment)
            }
        } catch {
            await MainActor.run {
                viewModel.errorMessage = error.localizedDescription
                viewModel.showError = true
            }
        }
    }

    private func handleCapturedImage(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.9) ?? image.pngData() else {
            viewModel.errorMessage = "Unable to process the captured image."
            viewModel.showError = true
            return
        }

        do {
            let attachment = try ImageAttachmentProcessor.process(data: data)
            applyImageAttachment(attachment)
        } catch {
            viewModel.errorMessage = error.localizedDescription
            viewModel.showError = true
        }
    }

    private func handleImportedTextFile(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            Task {
                await importTextFile(from: url)
            }
        case .failure(let error):
            viewModel.errorMessage = error.localizedDescription
            viewModel.showError = true
        }
    }

    private func importTextFile(from url: URL) async {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            let rawText = String(decoding: data.prefix(48_000), as: UTF8.self)
            let trimmedText = rawText.trimmingCharacters(in: .whitespacesAndNewlines)

            guard !trimmedText.isEmpty else {
                await MainActor.run {
                    viewModel.errorMessage = "The selected file does not contain readable text."
                    viewModel.showError = true
                }
                return
            }

            let importedText: String
            if trimmedText.count > 10_000 {
                importedText = String(trimmedText.prefix(10_000)) + "\n\n[Imported text truncated]"
            } else {
                importedText = trimmedText
            }

            await MainActor.run {
                insertTextIntoComposer(importedText)
            }
        } catch {
            await MainActor.run {
                viewModel.errorMessage = "Unable to import that file."
                viewModel.showError = true
            }
        }
    }

    private func pasteClipboardText() {
        guard let text = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            viewModel.errorMessage = "There is no text on the clipboard."
            viewModel.showError = true
            return
        }

        insertTextIntoComposer(text)
    }

    private func pasteClipboardImage() {
        guard let image = UIPasteboard.general.image,
              let data = image.jpegData(compressionQuality: 0.9) ?? image.pngData() else {
            viewModel.errorMessage = "There is no image on the clipboard."
            viewModel.showError = true
            return
        }

        do {
            let attachment = try ImageAttachmentProcessor.process(data: data)
            applyImageAttachment(attachment)
        } catch {
            viewModel.errorMessage = error.localizedDescription
            viewModel.showError = true
        }
    }

    private func insertTextIntoComposer(_ text: String) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        if viewModel.userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            viewModel.userPrompt = trimmedText
        } else {
            viewModel.userPrompt += "\n\n" + trimmedText
        }

        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            activeComposerDrawer = nil
        }
        triggerHaptic(.light)
        isInputFocused = true
    }

    private func applyImageAttachment(_ attachment: PromptImageAttachment) {
        viewModel.selectedImageAttachment = attachment
        if settings.selectedModality != .video {
            settings.selectedModality = .video
            settings.savePreferences()
        }
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            activeComposerDrawer = nil
        }
        triggerHaptic(.light)
        isInputFocused = true
    }

    private func removeSelectedImage() {
        viewModel.selectedImageAttachment = nil
        activeComposerDrawer = nil
        triggerHaptic(.light)
    }
}

private struct ThreadComposerOverlayHeightPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct FloatingChromeFade: View {
    @Environment(\.colorScheme) private var colorScheme

    let edge: VerticalEdge

    private var maskGradient: LinearGradient {
        LinearGradient(
            colors: edge == .top
                ? [Color.white, Color.white.opacity(0.74), Color.clear]
                : [Color.clear, Color.white.opacity(0.74), Color.white],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 34, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                RoundedRectangle(cornerRadius: 34, style: .continuous)
                    .fill(
                        colorScheme == .dark
                            ? Color.white.opacity(0.04)
                            : Color.white.opacity(0.22)
                    )
            }
            .mask(maskGradient)
            .shadow(
                color: Color.black.opacity(colorScheme == .dark ? 0.18 : 0.06),
                radius: 16,
                y: edge == .top ? 10 : -8
            )
    }
}

private struct CameraImagePicker: UIViewControllerRepresentable {
    let sourceType: UIImagePickerController.SourceType
    let onImagePicked: (UIImage) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onImagePicked: onImagePicked)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        controller.sourceType = sourceType
        controller.delegate = context.coordinator
        controller.allowsEditing = false
        return controller
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        private let onImagePicked: (UIImage) -> Void

        init(onImagePicked: @escaping (UIImage) -> Void) {
            self.onImagePicked = onImagePicked
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                onImagePicked(image)
            }
            picker.dismiss(animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
        }
    }
}
