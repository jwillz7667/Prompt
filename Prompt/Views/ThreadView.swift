//
//  ThreadView.swift
//  Prompt
//
//  Chat interface for multi-turn prompt enhancement threads
//

import SwiftUI

struct ThreadView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(PromptHistoryManager.self) private var historyManager

    @Bindable var viewModel: ThreadViewModel
    var threadId: String?

    @FocusState private var isInputFocused: Bool

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    /// Adaptive accent: cyan in dark, purple in light (matches app brand)
    private var accentColor: Color { Color.adaptiveButtonPrimary }
    
    private var canUseMaxMode: Bool {
        guard let remaining = storeKit.usageInfo?.maxModeRemaining else { return true }
        return remaining != 0
    }

    var body: some View {
        VStack(spacing: 0) {
            // Messages area
            messagesArea

            Divider()
                .opacity(0.3)

            // Input bar
            inputBar
        }
        .background { LiquidGlassBackground() }
        .navigationTitle(viewModel.threadTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if viewModel.currentThread != nil {
                    Menu {
                        Button {
                            renameThread()
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(textPrimary)
                    }
                }
            }
        }
        .task {
            if let threadId = threadId {
                await viewModel.loadThread(id: threadId)
            }
        }
        .alert("Error", isPresented: $viewModel.showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "An unknown error occurred")
        }
        .onChange(of: viewModel.showPaywall) { _, shouldShow in
            // Propagate paywall request upward if needed
        }
    }

    // MARK: - Messages Area

    private var messagesArea: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    if viewModel.turnMessages.isEmpty && !viewModel.isStreaming {
                        emptyState
                    }

                    ForEach(viewModel.turnMessages) { message in
                        ThreadMessageBubble(
                            message: message,
                            isStreaming: viewModel.isStreaming && message.id == "streaming"
                        )
                        .id(message.id)
                    }

                    // Streaming user message (before assistant response)
                    if viewModel.isStreaming && viewModel.streamingContent.isEmpty {
                        HStack {
                            Spacer()
                            HStack(spacing: 6) {
                                ProgressView()
                                    .scaleEffect(0.7)
                                Text("Processing...")
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(textSecondary)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background {
                                Capsule()
                                    .fill(.ultraThinMaterial)
                            }
                        }
                        .id("processing")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: viewModel.turnMessages.count) { _, _ in
                withAnimation(.spring(response: 0.3)) {
                    proxy.scrollTo(viewModel.turnMessages.last?.id, anchor: .bottom)
                }
            }
            .onChange(of: viewModel.streamingContent) { _, _ in
                withAnimation(.spring(response: 0.2)) {
                    proxy.scrollTo("streaming", anchor: .bottom)
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
                .frame(height: 60)

            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(textTertiary)

            VStack(spacing: 6) {
                Text("Start a Thread")
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text("Each message builds on previous enhancements\nfor compound prompt refinement")
                    .font(.system(.subheadline))
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()
                .frame(height: 40)
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        VStack(spacing: 10) {
            // Text input + send button
            HStack(alignment: .bottom, spacing: 10) {
                TextEditor(text: $viewModel.userPrompt)
                    .font(.system(.body))
                    .foregroundStyle(textPrimary)
                    .frame(minHeight: 36, maxHeight: 120)
                    .fixedSize(horizontal: false, vertical: true)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(colorScheme == .dark
                                ? Color.white.opacity(0.08)
                                : Color.black.opacity(0.05))
                    )
                    .overlay(
                        Capsule()
                            .stroke(
                                isInputFocused ? accentColor.opacity(0.5) : Color.white.opacity(colorScheme == .dark ? 0.12 : 0.0),
                                lineWidth: isInputFocused ? 1.5 : 1
                            )
                    )
                    .focused($isInputFocused)
                    .overlay(alignment: .leading) {
                        if viewModel.userPrompt.isEmpty {
                            Text("Enhance a prompt...")
                                .font(.body)
                                .foregroundStyle(textTertiary)
                                .padding(.leading, 18)
                                .allowsHitTesting(false)
                        }
                    }

                // Send button
                Button {
                    triggerHaptic(.medium)
                    isInputFocused = false
                    Task {
                        if settings.maxModeEnabled && !canUseMaxMode {
                            viewModel.showPaywall = true
                            settings.maxModeEnabled = false
                            settings.savePreferences()
                            return
                        }
                        await viewModel.addTurn(settings: settings, historyManager: historyManager)
                        await storeKit.syncWithBackend()
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 34))
                        .foregroundStyle(viewModel.canSend ? accentColor : textTertiary)
                        .symbolEffect(.bounce, value: viewModel.isStreaming)
                }
                .disabled(!viewModel.canSend)
                .animation(.spring(response: 0.3), value: viewModel.canSend)
            }

            // Compact selector row beneath input
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
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
                            viewModel.showPaywall = true
                            return
                        }
                        settings.maxModeEnabled.toggle()
                        settings.savePreferences()
                        triggerHaptic(.light)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: settings.maxModeEnabled ? "flame.fill" : "flame")
                                .font(.system(size: 11, weight: .semibold))
                            Text("MAX")
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .liquidGlassChip(isSelected: settings.maxModeEnabled, accentColor: .orange)
                    }
                    .buttonStyle(.plain)
                }
            }
            .animation(.spring(response: 0.3), value: settings.selectedModality)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }

    // MARK: - Actions

    private func renameThread() {
        // Simple alert-based rename for now
        // In a future iteration this could be an inline edit
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}
