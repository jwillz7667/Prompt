//
//  ChatView.swift
//  Prompt
//
//  The general-purpose assistant screen: header, transcript with
//  near-bottom auto-follow and upward paging, error banner and composer.
//

import SwiftUI
import UIKit

struct ChatView: View {
    @Bindable var viewModel: ChatViewModel
    let onOpenSidebar: () -> Void
    let onOpenProfile: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var isComposerFocused: Bool

    @State private var scrollPosition = ScrollPosition(edge: .bottom)
    @State private var isNearBottom = true
    @State private var hasUserScrolled = false
    @State private var showSettings = false
    @State private var showDeleteConfirmation = false
    @State private var reportingMessage: ChatTranscriptMessage?
    @State private var selectingMessage: ChatTranscriptMessage?
    @State private var deleteErrorMessage: String?

    /// Within this distance of the end the transcript follows new content.
    private let followThreshold: CGFloat = 140
    private let readableWidth: CGFloat = 760
    private let controlSize: CGFloat = 44

    var body: some View {
        content
            .background { LiquidGlassBackground() }
            .safeAreaInset(edge: .top, spacing: 0) { header }
            .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
            .sensoryFeedback(.impact(weight: .light), trigger: viewModel.sendCount)
            .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.7), trigger: viewModel.completionCount)
            .sensoryFeedback(.error, trigger: viewModel.failureCount)
            .sheet(isPresented: $showSettings) {
                ChatSettingsSheet(
                    initialTitle: viewModel.effectiveTitle ?? "",
                    initialInstructions: viewModel.effectiveSystemPrompt ?? ""
                ) { title, instructions in
                    try await viewModel.updateSettings(title: title, systemPrompt: instructions)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
            }
            .sheet(item: $reportingMessage) { message in
                ReportMessageSheet(message: message) { reason, details in
                    try await viewModel.report(message, reason: reason, details: details)
                }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
            }
            .sheet(item: $selectingMessage) { message in
                ChatSelectableTextSheet(text: message.content)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .confirmationDialog(
                "Delete this chat?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete Chat", role: .destructive) { deleteConversation() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently deletes the conversation and its messages.")
            }
            .alert(
                "Couldn't delete chat",
                isPresented: Binding(
                    get: { deleteErrorMessage != nil },
                    set: { if !$0 { deleteErrorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deleteErrorMessage ?? "")
            }
            .onChange(of: viewModel.transcriptRevision) { _, _ in
                hasUserScrolled = false
                isNearBottom = true
                scrollToBottom(animated: false)
            }
            .onChange(of: viewModel.sendCount) { _, _ in
                scrollToBottom(animated: true)
            }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.messages.isEmpty {
            switch viewModel.loadState {
            case .loading:
                ProgressView()
                    .controlSize(.large)
                    .tint(Color.adaptiveButtonPrimary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel(Text("Loading conversation"))
            case .failed(let message):
                loadFailure(message)
            case .idle, .loaded:
                emptyState
            }
        } else {
            transcript
        }
    }

    private var transcript: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                if viewModel.hasOlderMessages {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .accessibilityLabel(Text("Loading earlier messages"))
                }

                ForEach(viewModel.messages) { message in
                    row(for: message)
                }
            }
            .scrollTargetLayout()
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .padding(.bottom, 16)
            .frame(maxWidth: readableWidth)
            .frame(maxWidth: .infinity)
        }
        .scrollPosition($scrollPosition)
        .defaultScrollAnchor(.bottom)
        .scrollDismissesKeyboard(.interactively)
        .onScrollPhaseChange { _, newPhase in
            if newPhase == .interacting { hasUserScrolled = true }
        }
        .onScrollGeometryChange(for: ScrollMetrics.self) { geometry in
            ScrollMetrics(geometry)
        } action: { old, new in
            handleScroll(from: old, to: new)
        }
        .overlay(alignment: .bottom) {
            if !isNearBottom {
                jumpToBottomButton
                    .padding(.bottom, 10)
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: isNearBottom)
    }

    @ViewBuilder
    private func row(for message: ChatTranscriptMessage) -> some View {
        if message.id == viewModel.streamingMessageId {
            ChatStreamingReply(viewModel: viewModel)
                .id(message.id)
        } else {
            ChatMessageRow(
                message: message,
                canRegenerate: viewModel.canRegenerate(message),
                actions: rowActions
            )
            .equatable()
            .id(message.id)
        }
    }

    private var rowActions: ChatMessageActions {
        ChatMessageActions(
            onRegenerate: { viewModel.regenerate($0) },
            onReport: { reportingMessage = $0 },
            onSelectText: { selectingMessage = $0 },
            onRetryUnsent: { viewModel.retryUnsent(rowId: $0.id) },
            onEditUnsent: { message in
                viewModel.editUnsent(rowId: message.id)
                isComposerFocused = true
            }
        )
    }

    private var jumpToBottomButton: some View {
        Button {
            scrollToBottom(animated: true)
        } label: {
            Image(systemName: "arrow.down")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.adaptiveTextPrimary)
        }
        .buttonStyle(GlassIconButtonStyle(size: 38))
        .accessibilityLabel(Text("Scroll to latest message"))
    }

    // MARK: - Scrolling

    private struct ScrollMetrics: Equatable {
        let distanceFromBottom: CGFloat
        let distanceFromTop: CGFloat
        let contentHeight: CGFloat

        init(_ geometry: ScrollGeometry) {
            let maxOffset = geometry.contentSize.height + geometry.contentInsets.bottom - geometry.containerSize.height
            distanceFromBottom = max(0, maxOffset - geometry.contentOffset.y)
            distanceFromTop = max(0, geometry.contentOffset.y + geometry.contentInsets.top)
            contentHeight = geometry.contentSize.height
        }
    }

    private func handleScroll(from old: ScrollMetrics, to new: ScrollMetrics) {
        let nearBottom = new.distanceFromBottom <= followThreshold
        if nearBottom != isNearBottom { isNearBottom = nearBottom }

        // Content grew while the reader was at the end: keep the end in view.
        // Jumps (not animations) so a ~30 fps stream never queues animations.
        if new.contentHeight > old.contentHeight,
           old.distanceFromBottom <= followThreshold,
           !viewModel.isLoadingOlderMessages {
            scrollPosition.scrollTo(edge: .bottom)
        }

        if hasUserScrolled,
           new.distanceFromTop < 400,
           viewModel.hasOlderMessages,
           !viewModel.isLoadingOlderMessages {
            loadOlderMessages()
        }
    }

    private func loadOlderMessages() {
        let anchorId = viewModel.messages.first?.id
        Task {
            await viewModel.loadOlderMessages()
            if let anchorId {
                scrollPosition.scrollTo(id: anchorId, anchor: .top)
            }
        }
    }

    private func scrollToBottom(animated: Bool) {
        Task { @MainActor in
            // Let the new rows lay out before measuring the end.
            await Task.yield()
            if animated {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                    scrollPosition.scrollTo(edge: .bottom)
                }
            } else {
                scrollPosition.scrollTo(edge: .bottom)
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 2) {
            HStack(spacing: 10) {
                iconButton(systemName: "line.3.horizontal", label: String(localized: "Chats")) {
                    onOpenSidebar()
                }

                Spacer(minLength: 0)

                if viewModel.hasTranscript || viewModel.conversation != nil {
                    iconButton(systemName: "square.and.pencil", label: String(localized: "New chat")) {
                        viewModel.startNewConversation()
                        isComposerFocused = true
                    }
                    .keyboardShortcut("n", modifiers: .command)
                }

                moreMenu
            }

            if viewModel.conversation != nil {
                Text(viewModel.displayTitle)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(Color.adaptiveTextSecondary)
                    .lineLimit(1)
                    .padding(.horizontal, 56)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
    }

    private var moreMenu: some View {
        Menu {
            Button {
                showSettings = true
            } label: {
                Label("Name & Instructions", systemImage: "slider.horizontal.3")
            }

            if viewModel.conversation != nil {
                Button(role: .destructive) {
                    showDeleteConfirmation = true
                } label: {
                    Label("Delete Chat", systemImage: "trash")
                }
            }

            Divider()

            Button {
                onOpenProfile()
            } label: {
                Label("Profile & Settings", systemImage: "person.crop.circle")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.adaptiveTextPrimary)
                .frame(width: controlSize, height: controlSize)
                .background {
                    Circle().fill(colorScheme == .dark ? Color.white.opacity(0.12) : Color.white.opacity(0.85))
                }
                .overlay {
                    Circle().stroke(Color.white.opacity(colorScheme == .dark ? 0.3 : 0.9), lineWidth: 1)
                }
                .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.35 : 0.12), radius: 6, y: 3)
        }
        .accessibilityLabel(Text("Chat options"))
        .accessibilityIdentifier("chat.menu")
    }

    private func iconButton(systemName: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.adaptiveTextPrimary)
        }
        .buttonStyle(GlassIconButtonStyle(size: controlSize))
        .accessibilityLabel(Text(label))
    }

    // MARK: - Empty & Failure States

    private var emptyState: some View {
        ScrollView {
            VStack(spacing: 22) {
                VStack(spacing: 12) {
                    AppBrandMark(size: 64, showsGlassBackdrop: true)
                    Text("How can I help today?")
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .foregroundStyle(Color.adaptiveTextPrimary)
                        .multilineTextAlignment(.center)
                    Text("Ask Promptomize Assistant anything: explain, write, plan, brainstorm or code.")
                        .font(.subheadline)
                        .foregroundStyle(Color.adaptiveTextSecondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)

                if let instructions = viewModel.effectiveSystemPrompt {
                    Label("Custom instructions on", systemImage: "slider.horizontal.3")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.adaptiveButtonPrimary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .liquidGlassChip(isSelected: true)
                        .accessibilityHint(Text(instructions))
                }

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 220), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(ChatStarterSuggestion.defaults) { suggestion in
                        suggestionCard(suggestion)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 32)
            .frame(maxWidth: 620)
            .frame(maxWidth: .infinity)
            .containerRelativeFrame(.vertical, alignment: .center) { length, _ in length }
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
    }

    private func suggestionCard(_ suggestion: ChatStarterSuggestion) -> some View {
        Button {
            viewModel.sendSuggestion(suggestion)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: suggestion.systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.adaptiveButtonPrimary)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(suggestion.title)
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(Color.adaptiveTextPrimary)
                    Text(suggestion.subtitle)
                        .font(.caption)
                        .foregroundStyle(Color.adaptiveTextSecondary)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: 18, shadowIntensity: 0.35)
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isStreaming)
        .accessibilityLabel(Text("\(suggestion.title), \(suggestion.subtitle)"))
        .accessibilityHint(Text("Sends this request to the assistant"))
        .accessibilityIdentifier("chat.suggestion.\(suggestion.id)")
    }

    private func loadFailure(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(Color.adaptiveTextTertiary)
                .accessibilityHidden(true)
            Text("Couldn't load this chat")
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(Color.adaptiveTextPrimary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.adaptiveTextSecondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button("Try Again") {
                    Task { await viewModel.retryLoad() }
                }
                .buttonStyle(GlassCapsuleButtonStyle(tintColor: Color.adaptiveButtonPrimary, intensity: .prominent))
                .foregroundStyle(Color.adaptiveTextOnAccent)
                .padding(.horizontal, 4)

                Button("New Chat") {
                    viewModel.startNewConversation()
                }
                .buttonStyle(GlassCapsuleButtonStyle())
                .foregroundStyle(Color.adaptiveTextPrimary)
            }
            .font(.system(.subheadline, design: .rounded, weight: .semibold))
            .controlSize(.large)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: 8) {
            if let banner = viewModel.banner {
                ChatErrorBannerView(
                    banner: banner,
                    onRetry: { viewModel.performRetry($0) },
                    onDismiss: { viewModel.dismissBanner() }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            ChatComposer(viewModel: viewModel, isFocused: $isComposerFocused)

            Text("Promptomize Assistant can make mistakes. Check important info.")
                .font(.caption2)
                .foregroundStyle(Color.adaptiveTextTertiary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 6)
        .frame(maxWidth: readableWidth + 28)
        .frame(maxWidth: .infinity)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: viewModel.banner)
    }

    // MARK: - Actions

    private func deleteConversation() {
        Task {
            do {
                try await viewModel.deleteCurrentConversation()
            } catch {
                deleteErrorMessage = ChatViewModel.userMessage(for: error)
            }
        }
    }
}

// MARK: - Composer

private struct ChatComposer: View {
    @Bindable var viewModel: ChatViewModel
    var isFocused: FocusState<Bool>.Binding

    private var characterCount: Int { viewModel.trimmedDraft.count }
    private var showsCounter: Bool { characterCount > ChatLimits.maxMessageLength - 2_000 }

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField(
                    "",
                    text: $viewModel.draft,
                    prompt: Text("Message Promptomize Assistant").foregroundStyle(Color.adaptiveTextTertiary),
                    axis: .vertical
                )
                .font(.body)
                .foregroundStyle(Color.adaptiveTextPrimary)
                .lineLimit(1...6)
                .textFieldStyle(.plain)
                .focused(isFocused)
                .padding(.leading, 16)
                .padding(.vertical, 12)
                .accessibilityLabel(Text("Message"))
                .accessibilityIdentifier("chat.composer")

                actionButton
                    .padding(.trailing, 5)
                    .padding(.bottom, 5)
            }
            .liquidGlassInput(cornerRadius: 24, isFocused: isFocused.wrappedValue)

            if showsCounter {
                Text("\(characterCount)/\(ChatLimits.maxMessageLength)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(viewModel.isDraftTooLong ? Color.red : Color.adaptiveTextTertiary)
                    .padding(.trailing, 12)
            }
        }
    }

    @ViewBuilder
    private var actionButton: some View {
        if viewModel.isStreaming {
            Button {
                viewModel.stopStreaming()
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.adaptiveTextPrimary))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(".", modifiers: .command)
            .accessibilityLabel(Text("Stop generating"))
            .accessibilityIdentifier("chat.stop")
        } else {
            Button {
                viewModel.sendDraft()
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(viewModel.canSend ? Color.adaptiveTextOnAccent : Color.adaptiveTextTertiary)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle().fill(viewModel.canSend ? Color.adaptiveButtonPrimary : Color.adaptiveBackgroundTertiary)
                    )
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canSend)
            .keyboardShortcut(.return, modifiers: .command)
            .accessibilityLabel(Text("Send message"))
            .accessibilityIdentifier("chat.send")
        }
    }
}

// MARK: - Error Banner

private struct ChatErrorBannerView: View {
    let banner: ChatErrorBanner
    let onRetry: (ChatRetryAction) -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .accessibilityHidden(true)

            Text(banner.message)
                .font(.footnote)
                .foregroundStyle(Color.adaptiveTextPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

            if let retry = banner.retry {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let remaining = banner.retryAvailableAt.map { Int(ceil($0.timeIntervalSince(context.date))) } ?? 0
                    Button {
                        onRetry(retry)
                    } label: {
                        Text(remaining > 0 ? String(localized: "Retry in \(remaining)s") : String(localized: "Retry"))
                            .font(.footnote.weight(.semibold))
                            .monospacedDigit()
                    }
                    .buttonStyle(.borderless)
                    .disabled(remaining > 0)
                    .accessibilityIdentifier("chat.banner.retry")
                }
                .fixedSize()
            }

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.adaptiveTextSecondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Dismiss"))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .liquidGlass(cornerRadius: 16, shadowIntensity: 0.4)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Select Text

private struct ChatSelectableTextSheet: View {
    let text: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(text)
                    .font(.body)
                    .foregroundStyle(Color.adaptiveTextPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
            }
            .background { LiquidGlassBackground() }
            .navigationTitle("Select Text")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
