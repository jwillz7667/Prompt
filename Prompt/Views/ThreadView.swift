//
//  ThreadView.swift
//  Prompt
//
//  Chat-native prompt optimization surface used for both the main home screen
//  and historical thread detail screens.
//

import SwiftUI
import UIKit

struct ThreadView: View {
    enum PresentationStyle {
        case home
        case detail
    }

    @Environment(\.colorScheme) private var colorScheme
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(PromptHistoryManager.self) private var historyManager

    @Bindable var viewModel: ThreadViewModel
    var threadId: String?
    var presentationStyle: PresentationStyle = .detail

    @StateObject private var contextService = ContextService.shared
    @State private var expandedPowerTool: PowerToolsSection.PowerTool?
    @State private var showFullVariations = false
    @State private var showSandbox = false
    @State private var showWorkflows = false
    @State private var showContextsManager = false
    @State private var showContextPicker = false
    @State private var showPaywallSheet = false
    @FocusState private var isInputFocused: Bool

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.adaptiveButtonPrimary }
    private var composerBorder: Color {
        isInputFocused ? accentColor.opacity(0.55) : Color.white.opacity(colorScheme == .dark ? 0.12 : 0.5)
    }

    private var canUseMaxMode: Bool {
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

    var body: some View {
        Group {
            if presentationStyle == .detail {
                threadContent
                    .navigationTitle(viewModel.threadTitle)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            } else {
                threadContent
            }
        }
        .background { LiquidGlassBackground() }
        .task {
            if let threadId {
                await viewModel.loadThread(id: threadId)
            }
        }
        .task {
            await contextService.loadContextsIfNeeded()
        }
        .sheet(isPresented: $showPaywallSheet) {
            PaywallView()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
        }
        .sheet(isPresented: $showContextsManager) {
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
        .sheet(isPresented: $showFullVariations) {
            VariationsView(promptText: latestPromptForTools ?? viewModel.userPrompt)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
        }
        .popover(isPresented: $showContextPicker) {
            contextPickerPopover
                .frame(width: 300, height: 340)
                .presentationCompactAdaptation(.popover)
        }
        .alert("Error", isPresented: $viewModel.showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "An unknown error occurred")
        }
        .onChange(of: viewModel.showPaywall) { _, shouldShow in
            guard shouldShow else { return }
            showPaywallSheet = true
            viewModel.showPaywall = false
        }
    }

    private var threadContent: some View {
        VStack(spacing: 0) {
            messagesArea

            Divider()
                .opacity(0.3)

            composerArea
        }
    }

    // MARK: - Messages

    private var messagesArea: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 18) {
                    if isHomeWelcomeState {
                        welcomeState
                            .id("welcome")
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    } else if viewModel.turnMessages.isEmpty && !viewModel.isStreaming {
                        emptyState
                            .id("empty")
                    }

                    if let attachedContext = viewModel.attachedContext, viewModel.hasConversation {
                        attachedContextCard(attachedContext)
                            .id("thread-context")
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

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
                        .frame(height: 8)
                        .id("thread-bottom")
                }
                .padding(.horizontal, 16)
                .padding(.top, isHomeWelcomeState ? 36 : 12)
                .padding(.bottom, 20)
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
            Spacer()
            HStack(spacing: 8) {
                ProgressView()
                    .scaleEffect(0.72)
                Text("Optimizing in thread...")
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background {
                Capsule()
                    .fill(.ultraThinMaterial)
            }
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
                showPaywallSheet = true
            },
            onOpenSheet: { tool in
                handlePowerToolSheet(tool)
            }
        )
        .id("power-tools")
        .transition(.opacity.combined(with: .scale(scale: 0.98)))
    }

    // MARK: - Welcome / Empty

    private var welcomeState: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Group {
                        if UIImage(named: "AppLogo") != nil {
                            Image("AppLogo")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 42, height: 42)
                        } else {
                            Image(systemName: "sparkles.rectangle.stack.fill")
                                .font(.system(size: 28, weight: .medium))
                                .foregroundStyle(accentColor)
                        }
                    }

                    Text("Prompt conversations, not one-off cards.")
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text("Start with a rough prompt, optimize it into a live thread, then keep refining with MAX mode, contexts, and power tools without leaving the conversation.")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let attachedContext = viewModel.attachedContext {
                attachedContextHeroPill(attachedContext)
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Try a starting point")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(textTertiary)

                ForEach(starterPrompts, id: \.title) { prompt in
                    Button {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                            viewModel.userPrompt = prompt.prompt
                        }
                        isInputFocused = true
                        triggerHaptic(.light)
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: prompt.icon)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(accentColor)
                                .frame(width: 18, height: 18)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(prompt.title)
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textPrimary)

                                Text(prompt.prompt)
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(textSecondary)
                                    .lineLimit(2)
                            }

                            Spacer()

                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(textTertiary)
                        }
                        .padding(14)
                    }
                    .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 18))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .liquidGlass(cornerRadius: 28, shadowIntensity: 0.95, borderGlow: true)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
                .frame(height: 60)

            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(textTertiary)

            Text("Continue refining in this thread")
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            Text("Every follow-up builds on the latest optimized prompt, so you can refine intent, constraints, and modality without starting over.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)

            Spacer()
                .frame(height: 20)
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Composer

    private var composerArea: some View {
        VStack(spacing: 12) {
            contextAttachmentRow
            composerCard
            selectorRow
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .background {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }

    private var contextAttachmentRow: some View {
        HStack(spacing: 8) {
            if let attachedContext = viewModel.attachedContext {
                HStack(spacing: 8) {
                    Image(systemName: "folder.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(accentColor)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(attachedContext.name)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(textPrimary)
                            .lineLimit(1)
                        if let description = attachedContext.description, !description.isEmpty {
                            Text(description)
                                .font(.system(size: 11, weight: .medium, design: .rounded))
                                .foregroundStyle(textTertiary)
                                .lineLimit(1)
                        }
                    }

                    Button {
                        Task {
                            await viewModel.updateAttachedContext(nil)
                        }
                        triggerHaptic(.light)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(textTertiary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .liquidGlassChip(isSelected: true, accentColor: accentColor)

                Button("Change") {
                    openContextSelector()
                }
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(textSecondary)
                .buttonStyle(GlassCapsuleButtonStyle())
            } else {
                Button {
                    openContextSelector()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Attach Context")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                    }
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(GlassCapsuleButtonStyle())
            }

            Spacer()
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.84), value: viewModel.attachedContext)
    }

    private var composerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .topLeading) {
                TextEditor(text: $viewModel.userPrompt)
                    .font(.system(.body, design: .default))
                    .foregroundStyle(textPrimary)
                    .frame(minHeight: isHomeWelcomeState ? 140 : 100, maxHeight: 220)
                    .scrollContentBackground(.hidden)
                    .focused($isInputFocused)

                if viewModel.userPrompt.isEmpty {
                    Text(isHomeWelcomeState ? "Paste the raw prompt you want optimized..." : "Send a follow-up refinement...")
                        .font(.body)
                        .foregroundStyle(textTertiary)
                        .padding(.top, 8)
                        .allowsHitTesting(false)
                }
            }

            HStack(alignment: .center, spacing: 12) {
                Text("\(viewModel.userPrompt.count) chars")
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(textTertiary)
                    .contentTransition(.numericText())

                Spacer()

                if isHomeWelcomeState {
                    Button(action: submitPrompt) {
                        HStack(spacing: 8) {
                            if viewModel.isStreaming {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            Text(viewModel.isStreaming ? "Optimizing..." : "Optimize Prompt")
                                .font(.system(.subheadline, design: .rounded, weight: .bold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .foregroundStyle(viewModel.canSend ? Color.adaptiveTextOnAccent : textTertiary)
                    }
                    .buttonStyle(LiquidGlassButtonStyle(
                        cornerRadius: 18,
                        tintColor: viewModel.canSend ? accentColor : nil,
                        intensity: viewModel.canSend ? .prominent : .subtle
                    ))
                    .disabled(!viewModel.canSend)
                } else {
                    Button(action: submitPrompt) {
                        Image(systemName: viewModel.isStreaming ? "ellipsis.circle.fill" : "arrow.up.circle.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(viewModel.canSend ? accentColor : textTertiary)
                            .symbolEffect(.bounce, value: viewModel.isStreaming)
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.canSend)
                }
            }
        }
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(composerBorder, lineWidth: isInputFocused ? 1.4 : 1)
                }
                .overlay {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .fill(accentColor.opacity(colorScheme == .dark ? 0.06 : 0.04))
                }
        }
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.28 : 0.08), radius: 18, y: 10)
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: viewModel.canSend)
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: isInputFocused)
    }

    private var selectorRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
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

                Button {
                    if !settings.maxModeEnabled && !canUseMaxMode {
                        showPaywallSheet = true
                        return
                    }
                    settings.maxModeEnabled.toggle()
                    settings.savePreferences()
                    triggerHaptic(.light)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: settings.maxModeEnabled ? "flame.fill" : "flame")
                            .font(.system(size: 11, weight: .semibold))
                        Text("MAX")
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                        if let remaining = storeKit.usageInfo?.maxModeRemaining, remaining >= 0 {
                            Text("\(remaining)")
                                .font(.system(size: 9, weight: .bold, design: .rounded))
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .liquidGlassChip(isSelected: settings.maxModeEnabled, accentColor: .orange)
                }
                .buttonStyle(.plain)
            }
            .animation(.spring(response: 0.28, dampingFraction: 0.84), value: settings.selectedModality)
        }
    }

    // MARK: - Context

    private func attachedContextCard(_ context: ThreadAttachedContextRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "folder.fill.badge.plus")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(accentColor)
                    .frame(width: 28, height: 28)
                    .background {
                        Circle()
                            .fill(accentColor.opacity(0.14))
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Thread Context")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(textTertiary)
                    Text(context.name)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(textPrimary)
                }

                Spacer()
            }

            if let description = context.description, !description.isEmpty {
                Text(description)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !context.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(context.tags.prefix(4), id: \.self) { tag in
                            Text(tag)
                                .font(.system(.caption2, design: .rounded, weight: .medium))
                                .foregroundStyle(textSecondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .liquidGlass(cornerRadius: 8)
                        }
                    }
                }
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 20, shadowIntensity: 0.65, borderGlow: true)
    }

    private func attachedContextHeroPill(_ context: ThreadAttachedContextRecord) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "folder.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(accentColor)
            Text("Using \(context.name)")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .liquidGlassChip(isSelected: true, accentColor: accentColor)
    }

    private var contextPickerPopover: some View {
        NavigationStack {
            List {
                if !contextService.contexts.isEmpty {
                    ForEach(contextService.contexts) { context in
                        Button {
                            Task {
                                await viewModel.updateAttachedContext(context)
                            }
                            showContextPicker = false
                            triggerHaptic(.light)
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: context.isGlobal ? "globe" : "folder.fill")
                                    .foregroundStyle(accentColor)
                                    .frame(width: 18)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(context.name)
                                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                                        .foregroundStyle(textPrimary)
                                    if let description = context.description, !description.isEmpty {
                                        Text(description)
                                            .font(.system(.caption, design: .rounded))
                                            .foregroundStyle(textSecondary)
                                            .lineLimit(1)
                                    }
                                }

                                Spacer()

                                if viewModel.attachedContext?.id == context.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(accentColor)
                                }
                            }
                        }
                    }
                } else {
                    ContentUnavailableView(
                        "No Contexts Yet",
                        systemImage: "folder.badge.plus",
                        description: Text("Create a reusable context first, then attach it to the thread.")
                    )
                }
            }
            .listStyle(.plain)
            .navigationTitle("Attach Context")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Manage") {
                        showContextPicker = false
                        showContextsManager = true
                    }
                    .foregroundStyle(accentColor)
                }
            }
        }
    }

    // MARK: - Actions

    private func openContextSelector() {
        if contextService.contexts.isEmpty {
            showContextsManager = true
        } else {
            showContextPicker = true
        }
        triggerHaptic(.light)
    }

    private func handlePowerToolSheet(_ tool: PowerToolsSection.PowerTool) {
        switch tool {
        case .variations:
            showFullVariations = true
        case .sandbox:
            showSandbox = true
        case .workflows:
            showWorkflows = true
        case .contexts:
            showContextsManager = true
        }
    }

    private func submitPrompt() {
        triggerHaptic(.medium)
        isInputFocused = false

        if settings.maxModeEnabled && !canUseMaxMode {
            settings.maxModeEnabled = false
            settings.savePreferences()
            showPaywallSheet = true
            return
        }

        Task {
            await viewModel.addTurn(settings: settings, historyManager: historyManager)
            await storeKit.syncWithBackend()
        }
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}

private extension ThreadView {
    struct StarterPrompt: Identifiable {
        let title: String
        let icon: String
        let prompt: String

        var id: String { title }
    }

    var starterPrompts: [StarterPrompt] {
        [
            StarterPrompt(
                title: "Product spec upgrade",
                icon: "doc.text.magnifyingglass",
                prompt: "Turn this rough product spec into a concise but production-ready AI prompt that defines scope, constraints, deliverables, and acceptance criteria."
            ),
            StarterPrompt(
                title: "Creative prompt rewrite",
                icon: "photo.on.rectangle.angled",
                prompt: "Rewrite this rough image idea into a strong generation prompt with better subject hierarchy, composition, lighting, and failure-avoidance constraints."
            ),
            StarterPrompt(
                title: "Coding task refinement",
                icon: "chevron.left.forwardslash.chevron.right",
                prompt: "Transform this rough coding request into a stronger implementation prompt that specifies environment, files to change, edge cases, testing expectations, and completion criteria."
            ),
        ]
    }
}
