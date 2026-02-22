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

    @Bindable var viewModel: ThreadViewModel
    var threadId: String?

    @FocusState private var isInputFocused: Bool

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { Color.brandCyan }

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
        VStack(spacing: 8) {
            // Selector row
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
            }
            .padding(.horizontal, 16)

            // Text input + send button
            HStack(alignment: .bottom, spacing: 10) {
                TextEditor(text: $viewModel.userPrompt)
                    .font(.system(.body))
                    .foregroundStyle(textPrimary)
                    .frame(minHeight: 36, maxHeight: 120)
                    .fixedSize(horizontal: false, vertical: true)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(.ultraThinMaterial)
                            .overlay {
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .stroke(
                                        isInputFocused ? accentColor.opacity(0.4) : Color.clear,
                                        lineWidth: 1
                                    )
                            }
                    }
                    .focused($isInputFocused)
                    .overlay(alignment: .leading) {
                        if viewModel.userPrompt.isEmpty {
                            Text("Enhance a prompt...")
                                .font(.body)
                                .foregroundStyle(textTertiary)
                                .padding(.leading, 16)
                                .allowsHitTesting(false)
                        }
                    }

                // Send button
                Button {
                    triggerHaptic(.medium)
                    isInputFocused = false
                    Task {
                        await viewModel.addTurn(settings: settings)
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(viewModel.canSend ? accentColor : textTertiary)
                        .symbolEffect(.bounce, value: viewModel.isStreaming)
                }
                .disabled(!viewModel.canSend)
                .animation(.spring(response: 0.3), value: viewModel.canSend)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .padding(.top, 8)
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
