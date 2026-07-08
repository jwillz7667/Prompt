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
    @State private var optimizeViewModel = OptimizeViewModel()
    @State private var optimizeSeed: OptimizeSeedPrompt?
    @State private var showPhotoPicker = false
    @State private var showTextFileImporter = false
    @State private var showCameraCapture = false
    @State private var showMaxModeToast = false
    @State private var activeComposerDrawer: ComposerDrawer?
    @State private var composerOverlayHeight: CGFloat = 164
    @State private var drawerDragOffset: CGFloat = 0
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

    /// Controls how solid vs translucent the composer controls appear.
    /// 1.0 = typing (most visible), 0.0 = streaming (most translucent/glass)
    private var composerGlassIntensity: Double {
        if isInputFocused || !viewModel.userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return 1.0
        }
        if viewModel.isStreaming {
            return 0.0
        }
        return 0.35
    }

    private var shouldShowSendButton: Bool {
        viewModel.canSend
    }

    private var inputPlaceholder: String {
        let modality = settings.selectedModality
        if viewModel.hasConversation {
            switch conversationMode {
            case .optimize:
                return "Follow up or refine..."
            case .chat:
                return chatFollowUpPlaceholder(for: modality)
            }
        }
        switch conversationMode {
        case .optimize:
            return optimizePlaceholder(for: modality)
        case .chat:
            return chatPlaceholder(for: modality)
        }
    }

    private func optimizePlaceholder(for modality: ModalityType) -> String {
        switch modality {
        case .image: return "Describe your image..."
        case .video: return "Describe your video..."
        case .code: return "Describe what to build..."
        case .audio: return "Describe your audio..."
        case .music: return "Describe your music..."
        case .threeD: return "Describe your 3D model..."
        case .text: return "Paste a prompt to optimize..."
        }
    }

    private func chatPlaceholder(for modality: ModalityType) -> String {
        switch modality {
        case .image: return "Ask about images..."
        case .video: return "Ask about video..."
        case .code: return "Ask about code..."
        case .audio: return "Ask about audio..."
        case .music: return "Ask about music..."
        case .threeD: return "Ask about 3D..."
        case .text: return "Ask anything..."
        }
    }

    private func chatFollowUpPlaceholder(for modality: ModalityType) -> String {
        switch modality {
        case .image: return "Refine style or details..."
        case .video: return "Refine scene or pacing..."
        case .code: return "Modify or extend..."
        case .audio: return "Adjust mood or layers..."
        case .music: return "Tweak genre or tempo..."
        case .threeD: return "Adjust details..."
        case .text: return "Continue chatting..."
        }
    }

    private var imagePromptPlaceholder: String {
        switch conversationMode {
        case .optimize:
            return "Describe motion or style..."
        case .chat:
            return "Ask about this image..."
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
        .sheet(item: $optimizeSeed) { seed in
            OptimizeSheet(initialPrompt: seed.prompt, viewModel: optimizeViewModel)
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
                VStack(spacing: 0) {
                    // Suggestion chips when no conversation
                    if !viewModel.hasConversation && !isInputFocused {
                        suggestionChips
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    floatingComposerOverlay
                }
            }
    }

    // MARK: - Header

    private var workspaceHeader: some View {
        HStack(spacing: 10) {
            // Hamburger menu - opens sidebar
            iconButton(systemName: "line.3.horizontal", action: {
                triggerHaptic(.light)
                if let onOpenHistory {
                    onOpenHistory()
                } else {
                    showWorkspaceActions = true
                }
            })

            Spacer(minLength: 0)

            if let onStartNewConversation, viewModel.hasConversation {
                iconButton(systemName: "square.and.pencil", action: {
                    triggerHaptic(.light)
                    onStartNewConversation()
                })
            }

            profileButton
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
    }

    private var floatingWorkspaceHeader: some View {
        workspaceHeader
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

    // MARK: - Suggestion Chips

    private struct SuggestionItem: Identifiable {
        let id = UUID()
        let title: String
        let subtitle: String
        let prompt: String
        /// If set, selecting this chip also switches the modality
        var switchModality: ModalityType?
    }

    private var currentSuggestions: [SuggestionItem] {
        let modality = settings.selectedModality
        switch conversationMode {
        case .optimize:
            return optimizeSuggestions(for: modality)
        case .chat:
            return chatSuggestions(for: modality)
        }
    }

    private func optimizeSuggestions(for modality: ModalityType) -> [SuggestionItem] {
        switch modality {
        case .text:
            return [
                SuggestionItem(title: "Create an image", subtitle: "for my presentation", prompt: "Create an image for my presentation", switchModality: .image),
                SuggestionItem(title: "Write code", subtitle: "to solve a problem", prompt: "Write code to solve a problem", switchModality: .code),
                SuggestionItem(title: "Create a video", subtitle: "product showcase", prompt: "Create a video prompt for a product showcase", switchModality: .video),
                SuggestionItem(title: "Compose audio", subtitle: "for a short film", prompt: "Compose audio for a short film", switchModality: .audio),
            ]
        case .image:
            return [
                SuggestionItem(title: "Futuristic cityscape", subtitle: "at golden hour sunset", prompt: "A futuristic cityscape at golden hour with neon reflections"),
                SuggestionItem(title: "Portrait photo", subtitle: "dramatic studio lighting", prompt: "A cinematic portrait with dramatic studio lighting and shallow depth of field"),
                SuggestionItem(title: "Product shot", subtitle: "clean minimal background", prompt: "A sleek product shot on white marble with soft studio lighting"),
                SuggestionItem(title: "Abstract art", subtitle: "fluid colors and motion", prompt: "Abstract fluid art with vibrant flowing colors and organic motion"),
            ]
        case .video:
            return [
                SuggestionItem(title: "Drone flyover", subtitle: "cinematic mountain reveal", prompt: "Cinematic drone shot slowly revealing mountain peaks through morning clouds"),
                SuggestionItem(title: "Product reveal", subtitle: "smooth 360° rotation", prompt: "A smooth 360° product reveal with dramatic lighting on a dark background"),
                SuggestionItem(title: "Time-lapse", subtitle: "city day to night", prompt: "Time-lapse of a city skyline transitioning from golden hour to night"),
                SuggestionItem(title: "Slow motion", subtitle: "water splash close-up", prompt: "Extreme slow-motion close-up of a water splash with backlit droplets"),
            ]
        case .code:
            return [
                SuggestionItem(title: "REST API", subtitle: "with authentication", prompt: "Build a REST API endpoint with JWT authentication and input validation"),
                SuggestionItem(title: "React component", subtitle: "interactive data table", prompt: "Create a React component for a sortable, filterable data table"),
                SuggestionItem(title: "Algorithm", subtitle: "optimized search", prompt: "Write an efficient search algorithm with O(log n) complexity"),
                SuggestionItem(title: "Database query", subtitle: "complex aggregation", prompt: "Write a SQL query for aggregating user activity data with window functions"),
            ]
        case .audio:
            return [
                SuggestionItem(title: "Forest ambience", subtitle: "birds and gentle wind", prompt: "Ambient forest soundscape with birdsong, gentle wind, and a distant stream"),
                SuggestionItem(title: "Podcast intro", subtitle: "professional and warm", prompt: "A warm professional podcast intro with subtle music bed and voice-over cue"),
                SuggestionItem(title: "Cinematic score", subtitle: "epic orchestral swell", prompt: "An epic orchestral score building from quiet strings to a powerful brass climax"),
                SuggestionItem(title: "Sound effect", subtitle: "sci-fi UI interactions", prompt: "Futuristic sci-fi UI sound effects for button clicks, transitions, and notifications"),
            ]
        case .music:
            return [
                SuggestionItem(title: "Lo-fi chill", subtitle: "study beats with vinyl", prompt: "Lo-fi chill hip hop beat with vinyl crackle, mellow keys, and a relaxed groove"),
                SuggestionItem(title: "Epic soundtrack", subtitle: "cinematic orchestra", prompt: "Epic cinematic soundtrack with sweeping strings, choir, and thunderous percussion"),
                SuggestionItem(title: "Acoustic ballad", subtitle: "fingerpicked guitar", prompt: "Acoustic guitar ballad with warm fingerpicking and soft vocal harmonies"),
                SuggestionItem(title: "Electronic drop", subtitle: "energetic dance beat", prompt: "High-energy electronic dance track with a massive synth drop and driving bass"),
            ]
        case .threeD:
            return [
                SuggestionItem(title: "Character model", subtitle: "stylized low-poly", prompt: "A stylized low-poly character model with clean topology for game animation"),
                SuggestionItem(title: "Interior scene", subtitle: "realistic living room", prompt: "A photorealistic modern living room interior with natural lighting and PBR materials"),
                SuggestionItem(title: "Sci-fi weapon", subtitle: "hard-surface concept", prompt: "A detailed hard-surface sci-fi weapon concept with metallic and emissive materials"),
                SuggestionItem(title: "Architecture", subtitle: "modern building exterior", prompt: "Architectural visualization of a modern glass building with landscape and sky dome"),
            ]
        }
    }

    private func chatSuggestions(for modality: ModalityType) -> [SuggestionItem] {
        switch modality {
        case .text:
            return [
                SuggestionItem(title: "Help me write", subtitle: "a compelling blog post", prompt: "Help me write a compelling blog post about an interesting topic"),
                SuggestionItem(title: "Brainstorm ideas", subtitle: "for a project", prompt: "Help me brainstorm creative ideas for my project"),
                SuggestionItem(title: "Improve my writing", subtitle: "make it more engaging", prompt: "How can I make my writing more engaging and persuasive?"),
                SuggestionItem(title: "Prompt tips", subtitle: "write better prompts", prompt: "What are the best techniques for writing effective AI prompts?"),
            ]
        case .image:
            return [
                SuggestionItem(title: "Style guide", subtitle: "what makes great prompts", prompt: "What makes a great image prompt? Teach me the key elements"),
                SuggestionItem(title: "Describe a scene", subtitle: "help me visualize it", prompt: "Help me describe a scene I'm imagining so I can turn it into an image prompt"),
                SuggestionItem(title: "Prompt techniques", subtitle: "parameters and styles", prompt: "What are the best parameters and style keywords for image prompts?"),
                SuggestionItem(title: "Style exploration", subtitle: "art styles and mediums", prompt: "What art styles, mediums, and techniques can I use in image prompts?"),
            ]
        case .video:
            return [
                SuggestionItem(title: "Camera movements", subtitle: "how to describe them", prompt: "Teach me how to describe camera movements and angles for video prompts"),
                SuggestionItem(title: "Plan a scene", subtitle: "help me storyboard", prompt: "Help me plan and storyboard a video scene for my project"),
                SuggestionItem(title: "Video tips", subtitle: "get the best results", prompt: "What are the best tips for writing effective AI video generation prompts?"),
                SuggestionItem(title: "Transitions", subtitle: "smooth scene changes", prompt: "Suggest creative transition techniques between video scenes"),
            ]
        case .code:
            return [
                SuggestionItem(title: "Debug this", subtitle: "help me find the bug", prompt: "Help me debug an issue I'm having with my code"),
                SuggestionItem(title: "Explain a pattern", subtitle: "architecture help", prompt: "Explain common code architecture patterns and when to use them"),
                SuggestionItem(title: "Tech stack advice", subtitle: "pick the right tools", prompt: "Help me choose the right tech stack for my project"),
                SuggestionItem(title: "Best practices", subtitle: "error handling tips", prompt: "What are best practices for error handling and resilient code?"),
            ]
        case .audio:
            return [
                SuggestionItem(title: "Describe a sound", subtitle: "help me capture it", prompt: "Help me describe a specific sound I'm imagining for an audio prompt"),
                SuggestionItem(title: "Sound design tips", subtitle: "layering and mixing", prompt: "Teach me about sound design — layering, mixing, and spatial audio"),
                SuggestionItem(title: "Music for video", subtitle: "suggest styles", prompt: "Suggest music and audio styles that would work well for my video project"),
                SuggestionItem(title: "Audio techniques", subtitle: "layering and effects", prompt: "What techniques work best for different types of AI audio generation?"),
            ]
        case .music:
            return [
                SuggestionItem(title: "Write lyrics", subtitle: "for a song idea", prompt: "Help me write lyrics for a song I'm working on"),
                SuggestionItem(title: "Genre guide", subtitle: "find the right style", prompt: "Help me find the right music genre and style for the mood I want"),
                SuggestionItem(title: "Music tips", subtitle: "get better results", prompt: "What are the best tips and techniques for writing AI music prompts?"),
                SuggestionItem(title: "Song structure", subtitle: "verses and hooks", prompt: "Teach me about song structure — how to build verses, choruses, and hooks"),
            ]
        case .threeD:
            return [
                SuggestionItem(title: "Describe a model", subtitle: "help me specify it", prompt: "Help me describe a 3D model I want to create with proper detail"),
                SuggestionItem(title: "Materials guide", subtitle: "PBR and textures", prompt: "Teach me about PBR materials and textures for realistic 3D rendering"),
                SuggestionItem(title: "3D tips", subtitle: "get better results", prompt: "What are the best tips for writing effective AI 3D model generation prompts?"),
                SuggestionItem(title: "Topology advice", subtitle: "clean mesh structure", prompt: "Explain clean topology and mesh structure for 3D models"),
            ]
        }
    }

    private var suggestionChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(currentSuggestions) { suggestion in
                    suggestionChip(
                        title: suggestion.title,
                        subtitle: suggestion.subtitle
                    ) {
                        viewModel.userPrompt = suggestion.prompt
                        if let switchTo = suggestion.switchModality {
                            settings.selectedModality = switchTo
                            settings.savePreferences()
                        }
                        isInputFocused = true
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 4)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: settings.selectedModality)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: conversationMode)
    }

    private func suggestionChip(title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            triggerHaptic(.light)
            action()
        }) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)

                Text(subtitle)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textSecondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minWidth: 170, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.adaptiveBackgroundTertiary)
            }
        }
        .buttonStyle(.plain)
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
            isStreaming: viewModel.isStreaming && message.id == "streaming",
            onOptimize: optimizeAction(for: message)
        )
        .id(message.id)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    /// Reflection-loop entry point for a completed optimize-mode turn. The
    /// loop takes the turn's ORIGINAL user prompt (spec: it optimizes raw
    /// prompts, not the enhanced output). Hidden once the backend reports the
    /// feature flag is off.
    private func optimizeAction(for message: ThreadMessage) -> (() -> Void)? {
        guard message.role == .assistant,
              message.responseMode == .optimize,
              message.id != "streaming",
              optimizeViewModel.state != .featureDisabled,
              let originalPrompt = viewModel.turns
                  .first(where: { $0.turnIndex == message.turnIndex })?
                  .originalPrompt,
              !originalPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }

        return {
            triggerHaptic(.light)
            optimizeSeed = OptimizeSeedPrompt(prompt: originalPrompt)
        }
    }

    // MARK: - Composer

    @State private var showOptionsSheet = false

    private var composerInset: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Image attachment preview (when present)
            if let attachment = viewModel.selectedImageAttachment {
                HStack {
                    PromptImageAttachmentCard(
                        attachment: attachment,
                        height: 80,
                        showsAnalysisBadge: false,
                        onRemove: removeSelectedImage
                    )
                    .frame(width: 80, height: 80)
                    Spacer()
                }
                .padding(.horizontal, 16)
            }

            // Input row: [+] [text field] [modality] [send]
            HStack(spacing: 10) {
                // Plus button - opens options sheet
                Button {
                    triggerHaptic(.light)
                    toggleComposerDrawer(.attachments)
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(textPrimary)
                        .frame(width: floatingControlSize, height: floatingControlSize)
                        .background {
                            ZStack {
                                Circle().fill(.ultraThinMaterial)
                                Circle().fill(
                                    colorScheme == .dark
                                        ? Color.white.opacity(0.06 + 0.06 * composerGlassIntensity)
                                        : Color.white.opacity(0.3 + 0.5 * composerGlassIntensity)
                                )
                                Circle().fill(
                                    LinearGradient(
                                        colors: [
                                            Color.white.opacity(colorScheme == .dark ? 0.2 * composerGlassIntensity : 0.6 * composerGlassIntensity),
                                            Color.clear
                                        ],
                                        startPoint: .top,
                                        endPoint: .center
                                    )
                                )
                            }
                        }
                        .clipShape(Circle())
                        .overlay {
                            Circle().stroke(
                                colorScheme == .dark
                                    ? Color.white.opacity(0.1 + 0.18 * composerGlassIntensity)
                                    : Color.white.opacity(0.4 + 0.45 * composerGlassIntensity),
                                lineWidth: 1
                            )
                        }
                }
                .buttonStyle(.plain)

                // Text input field
                HStack(spacing: 8) {
                    composerTextField
                        .frame(maxWidth: .infinity, minHeight: 24)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background {
                    ZStack {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(.ultraThinMaterial)
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(
                                colorScheme == .dark
                                    ? Color.white.opacity(0.03 + 0.05 * composerGlassIntensity)
                                    : Color.white.opacity(0.25 + 0.55 * composerGlassIntensity)
                            )
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(colorScheme == .dark ? 0.1 * composerGlassIntensity : 0.5 * composerGlassIntensity),
                                        Color.clear
                                    ],
                                    startPoint: .top,
                                    endPoint: .center
                                )
                            )
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(
                            isInputFocused
                                ? (colorScheme == .dark ? Color.brandCyan.opacity(0.7) : Color.brandPurple.opacity(0.45))
                                : (colorScheme == .dark
                                    ? Color.white.opacity(0.08 + 0.12 * composerGlassIntensity)
                                    : Color.white.opacity(0.3 + 0.5 * composerGlassIntensity)),
                            lineWidth: isInputFocused ? 1.5 : 1
                        )
                }
                .onTapGesture {
                    activeComposerDrawer = nil
                    isInputFocused = true
                }

                // Modality selector button
                Button {
                    triggerHaptic(.light)
                    toggleComposerDrawer(.modalities)
                } label: {
                    let hasNonTextModality = settings.selectedModality != .text
                    let isMaxOn = settings.maxModeEnabled && storeKit.hasActiveSubscription
                    let buttonIcon = hasNonTextModality ? settings.selectedModality.icon : "slider.horizontal.3"
                    let buttonTint: Color = hasNonTextModality ? modalityAccentColor(for: settings.selectedModality) : textSecondary
                    let activeTint: Color = activeComposerDrawer == .modalities ? accentColor : buttonTint

                    ZStack(alignment: .topTrailing) {
                        Image(systemName: buttonIcon)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(activeTint)
                            .frame(width: floatingControlSize, height: floatingControlSize)
                            .background {
                                ZStack {
                                    Circle().fill(.ultraThinMaterial)
                                    if hasNonTextModality {
                                        Circle().fill(buttonTint.opacity((colorScheme == .dark ? 0.12 : 0.08) + 0.08 * composerGlassIntensity))
                                    } else {
                                        Circle().fill(
                                            colorScheme == .dark
                                                ? Color.white.opacity(0.06 + 0.06 * composerGlassIntensity)
                                                : Color.white.opacity(0.3 + 0.5 * composerGlassIntensity)
                                        )
                                    }
                                    Circle().fill(
                                        LinearGradient(
                                            colors: [
                                                Color.white.opacity(colorScheme == .dark ? 0.2 * composerGlassIntensity : 0.6 * composerGlassIntensity),
                                                Color.clear
                                            ],
                                            startPoint: .top,
                                            endPoint: .center
                                        )
                                    )
                                }
                            }
                            .clipShape(Circle())
                            .overlay {
                                Circle().stroke(
                                    colorScheme == .dark
                                        ? Color.white.opacity(0.1 + 0.18 * composerGlassIntensity)
                                        : Color.white.opacity(0.4 + 0.45 * composerGlassIntensity),
                                    lineWidth: 1
                                )
                            }

                        if isMaxOn {
                            Image(systemName: "flame.fill")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 18, height: 18)
                                .background {
                                    Circle()
                                        .fill(Color.orange)
                                }
                                .overlay {
                                    Circle()
                                        .stroke(Color.adaptiveBackgroundSecondary, lineWidth: 2)
                                }
                                .offset(x: 2, y: -2)
                        } else if hasActiveComposerOptions {
                            Circle()
                                .fill(accentColor)
                                .frame(width: 7, height: 7)
                                .offset(x: -2, y: 2)
                        }
                    }
                }
                .buttonStyle(.plain)

                // Send / enhance button
                if shouldShowSendButton {
                    sendButton
                        .transition(.scale.combined(with: .opacity))
                }
            }

            // Drawer content (modalities or attachments)
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
        .animation(.easeInOut(duration: 0.35), value: composerGlassIntensity)
    }

    private var floatingComposerOverlay: some View {
        composerInset
            .background {
                GeometryReader { proxy in
                    Color.clear
                        .preference(key: ThreadComposerOverlayHeightPreferenceKey.self, value: proxy.size.height)
                }
            }
    }

    @ViewBuilder
    private func composerDrawer(for drawer: ComposerDrawer) -> some View {
        VStack(spacing: 0) {
            // Drag handle
            Capsule()
                .fill(Color.adaptiveTextTertiary.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.top, 8)
                .padding(.bottom, 4)

            ScrollView(showsIndicators: false) {
                switch drawer {
                case .modalities:
                    modalityDrawerContent
                case .attachments:
                    attachmentDrawerContent
                }
            }
            .frame(maxHeight: drawer == .modalities ? 372 : 268)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .modifier(LiquidGlassModifier(cornerRadius: 26, material: .thin, shadowIntensity: 0.28, borderGlow: false))
        .offset(y: max(0, drawerDragOffset))
        .gesture(
            DragGesture()
                .onChanged { value in
                    drawerDragOffset = value.translation.height
                }
                .onEnded { value in
                    if value.translation.height > 80 || value.predictedEndTranslation.height > 160 {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                            activeComposerDrawer = nil
                            drawerDragOffset = 0
                        }
                    } else {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                            drawerDragOffset = 0
                        }
                    }
                }
        )
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
        .frame(maxWidth: .infinity, alignment: .leading)
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
        triggerHaptic(.light)
    }

    private func applyConversationMode(_ mode: ThreadConversationMode) {
        guard settings.conversationMode != mode else { return }
        settings.conversationMode = mode
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
        let isMaxLocked = !storeKit.hasActiveSubscription
        let isMaxActive = settings.maxModeEnabled && !isMaxLocked
        let maxFillColor: Color = isMaxActive ? Color.orange.opacity(colorScheme == .dark ? 0.12 : 0.08) : Color.white.opacity(colorScheme == .dark ? 0.03 : 0.22)
        let maxStrokeColor: Color = (isMaxActive ? Color.orange : accentColor).opacity(colorScheme == .dark ? 0.48 : 0.26)
        let maxStrokeWidth: CGFloat = isMaxActive ? 1.4 : 1

        return Button {
            if isMaxLocked {
                showPaywallSheet = true
            } else {
                toggleMaxMode()
            }
        } label: {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    Circle()
                        .fill((isMaxActive ? Color.orange : accentColor).opacity(colorScheme == .dark ? 0.18 : 0.12))

                    Image(systemName: isMaxActive ? "flame.fill" : "bolt.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(isMaxLocked ? textTertiary : (isMaxActive ? Color.orange : accentColor))
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(isMaxLocked ? "MAX quality" : (isMaxActive ? "MAX quality" : "Standard quality"))
                            .font(.system(.headline, design: .rounded, weight: .bold))
                            .foregroundStyle(isMaxLocked ? textSecondary : textPrimary)

                        if isMaxLocked {
                            Text("PRO")
                                .font(.system(size: 9, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background {
                                    Capsule()
                                        .fill(LinearGradient(
                                            colors: [Color.brandPurple, Color.brandCyan],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        ))
                                }
                        }
                    }

                    Text(maxModeSupportingCopy)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(isMaxLocked ? textTertiary : textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                if isMaxLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(textTertiary)
                } else {
                    Text(isMaxActive ? "On" : "Off")
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(isMaxActive ? Color.adaptiveTextOnAccent : textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background {
                            Capsule()
                                .fill(isMaxActive ? Color.orange : Color.white.opacity(colorScheme == .dark ? 0.08 : 0.46))
                        }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(maxFillColor)
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(
                        maxStrokeColor,
                        lineWidth: maxStrokeWidth
                    )
            }
        }
        .buttonStyle(.plain)
    }

    private var maxModeSupportingCopy: String {
        if !storeKit.hasActiveSubscription {
            return "Upgrade to Pro or Premium to unlock deeper reasoning with MAX mode."
        }

        if settings.maxModeEnabled {
            return "Deeper reasoning for harder rewrites and more complex prompts."
        }

        return "Use MAX when you need stronger reasoning and tighter prompt structure."
    }

    private func modalityTargetCard(_ modality: ModalityType) -> some View {
        let tint = modalityAccentColor(for: modality)
        let isSelected = settings.selectedModality == modality
        let isPremiumModality = modality != .text
        let isLocked = isPremiumModality && !storeKit.hasActiveSubscription
        let isActiveSelection = isSelected && !isLocked
        let cardFillColor: Color = isActiveSelection ? tint.opacity(colorScheme == .dark ? 0.14 : 0.10) : Color.white.opacity(colorScheme == .dark ? 0.03 : 0.18)
        let cardStrokeColor: Color = isActiveSelection ? tint.opacity(colorScheme == .dark ? 0.78 : 0.42) : Color.white.opacity(colorScheme == .dark ? 0.10 : 0.24)
        let cardStrokeWidth: CGFloat = isActiveSelection ? 1.5 : 1

        return Button {
            if isLocked {
                showPaywallSheet = true
            } else {
                applyModality(modality)
            }
        } label: {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    ZStack {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(tint.opacity(colorScheme == .dark ? 0.18 : 0.12))

                        Image(systemName: modality.icon)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(isLocked ? textTertiary : (isSelected ? tint : textPrimary))
                    }
                    .frame(width: 40, height: 40)

                    Spacer()

                    if isLocked {
                        Text("PRO")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background {
                                Capsule()
                                    .fill(LinearGradient(
                                        colors: [Color.brandPurple, Color.brandCyan],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    ))
                            }
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(modality.displayName)
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(isLocked ? textSecondary : textPrimary)

                    Text(modality.description)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(isLocked ? textTertiary : textSecondary)
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
                            .fill(cardFillColor)
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(
                        cardStrokeColor,
                        lineWidth: cardStrokeWidth
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

/// Sheet item seeding OptimizeSheet with one turn's original prompt.
private struct OptimizeSeedPrompt: Identifiable {
    let id = UUID()
    let prompt: String
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
