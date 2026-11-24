//
//  ChatMessageRow.swift
//  Prompt
//
//  Transcript rows: user bubbles, finished assistant replies with their
//  action bar, and the live streaming reply.
//

import SwiftUI
import UIKit

/// Actions a row can trigger. Grouped so rows stay `Equatable` on content
/// alone and SwiftUI can skip re-rendering finished messages.
struct ChatMessageActions {
    let onRegenerate: (ChatTranscriptMessage) -> Void
    let onReport: (ChatTranscriptMessage) -> Void
    let onSelectText: (ChatTranscriptMessage) -> Void
    let onRetryUnsent: (ChatTranscriptMessage) -> Void
    let onEditUnsent: (ChatTranscriptMessage) -> Void
}

struct ChatMessageRow: View, Equatable {
    let message: ChatTranscriptMessage
    let canRegenerate: Bool
    let actions: ChatMessageActions

    static func == (lhs: ChatMessageRow, rhs: ChatMessageRow) -> Bool {
        lhs.message == rhs.message && lhs.canRegenerate == rhs.canRegenerate
    }

    var body: some View {
        switch message.role {
        case .user:
            ChatUserBubble(message: message, actions: actions)
        case .assistant:
            ChatAssistantReply(message: message, canRegenerate: canRegenerate, actions: actions)
        }
    }
}

// MARK: - User

private struct ChatUserBubble: View {
    let message: ChatTranscriptMessage
    let actions: ChatMessageActions

    private var accent: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            HStack {
                Spacer(minLength: 48)
                Text(message.content)
                    .font(.body)
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(accent.opacity(message.status == .notSent ? 0.55 : 1))
                    }
                    .contextMenu {
                        Button {
                            UIPasteboard.general.string = message.content
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                        Button {
                            actions.onSelectText(message)
                        } label: {
                            Label("Select Text", systemImage: "selection.pin.in.out")
                        }
                        ShareLink(item: message.content) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                    }
                    .accessibilityLabel(Text("You said: \(message.content)"))
            }

            switch message.status {
            case .sending:
                Text("Sending…")
                    .font(.caption2)
                    .foregroundStyle(Color.adaptiveTextTertiary)
                    .accessibilityHidden(true)
            case .notSent:
                HStack(spacing: 12) {
                    Label("Not sent", systemImage: "exclamationmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                    Button("Retry") { actions.onRetryUnsent(message) }
                        .font(.caption.weight(.semibold))
                        .accessibilityHint(Text("Sends this message again"))
                    Button("Edit") { actions.onEditUnsent(message) }
                        .font(.caption.weight(.semibold))
                        .accessibilityHint(Text("Moves this message back into the message field"))
                }
                .buttonStyle(.borderless)
            case .complete, .stopped, .truncated, .failed:
                EmptyView()
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

// MARK: - Assistant

private struct ChatAssistantReply: View {
    let message: ChatTranscriptMessage
    let canRegenerate: Bool
    let actions: ChatMessageActions

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChatAssistantHeader()

            if !message.content.isEmpty {
                MarkdownText(source: message.content)
                    .foregroundStyle(Color.adaptiveTextPrimary)
                    .contentShape(Rectangle())
                    .contextMenu { contextMenu }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(Text("Promptomize Assistant said: \(message.content)"))
            }

            statusNote

            if message.serverId != nil {
                ChatAssistantActionBar(message: message, canRegenerate: canRegenerate, actions: actions)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var contextMenu: some View {
        Button {
            UIPasteboard.general.string = message.content
        } label: {
            Label("Copy", systemImage: "doc.on.doc")
        }
        Button {
            actions.onSelectText(message)
        } label: {
            Label("Select Text", systemImage: "selection.pin.in.out")
        }
        ShareLink(item: message.content) {
            Label("Share", systemImage: "square.and.arrow.up")
        }
        if canRegenerate {
            Button {
                actions.onRegenerate(message)
            } label: {
                Label("Regenerate", systemImage: "arrow.clockwise")
            }
        }
        if message.serverId != nil {
            Divider()
            Button(role: .destructive) {
                actions.onReport(message)
            } label: {
                Label("Report", systemImage: "flag")
            }
        }
    }

    @ViewBuilder
    private var statusNote: some View {
        switch message.status {
        case .truncated:
            ChatStatusNote(systemImage: "scissors", text: String(localized: "Response was cut short"))
        case .stopped:
            ChatStatusNote(systemImage: "stop.circle", text: String(localized: "Stopped"))
        case .failed:
            ChatStatusNote(
                systemImage: "exclamationmark.triangle",
                text: message.content.isEmpty
                    ? String(localized: "The response couldn't be generated")
                    : String(localized: "The response didn't finish")
            )
        case .complete, .sending, .notSent:
            EmptyView()
        }
    }
}

struct ChatAssistantHeader: View {
    var body: some View {
        HStack(spacing: 6) {
            AppBrandMark(size: 22, showsGlassBackdrop: false)
            Text("Promptomize Assistant")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(Color.adaptiveTextSecondary)
        }
        .accessibilityHidden(true)
    }
}

private struct ChatStatusNote: View {
    let systemImage: String
    let text: String

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.system(.caption, design: .rounded, weight: .medium))
            .foregroundStyle(Color.adaptiveTextTertiary)
    }
}

// MARK: - Action Bar

private struct ChatAssistantActionBar: View {
    let message: ChatTranscriptMessage
    let canRegenerate: Bool
    let actions: ChatMessageActions

    @State private var didCopy = false

    var body: some View {
        HStack(spacing: 4) {
            if !message.content.isEmpty {
                barButton(
                    systemImage: didCopy ? "checkmark" : "doc.on.doc",
                    label: didCopy ? String(localized: "Copied") : String(localized: "Copy")
                ) {
                    UIPasteboard.general.string = message.content
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.spring(response: 0.3)) { didCopy = true }
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        withAnimation(.easeOut(duration: 0.2)) { didCopy = false }
                    }
                }

                ShareLink(item: message.content) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14, weight: .medium))
                        .frame(width: 34, height: 34)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(Color.adaptiveTextSecondary)
                .accessibilityLabel(Text("Share"))
            }

            if canRegenerate {
                barButton(systemImage: "arrow.clockwise", label: String(localized: "Regenerate")) {
                    actions.onRegenerate(message)
                }
            }

            barButton(systemImage: "flag", label: String(localized: "Report")) {
                actions.onReport(message)
            }

            Spacer(minLength: 0)
        }
        .padding(.leading, -8)
    }

    private func barButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color.adaptiveTextSecondary)
                .frame(width: 34, height: 34)
                .contentShape(Rectangle())
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }
}

// MARK: - Streaming

/// The reply currently being generated. It is the only view that reads
/// `streamingText`, so throttled token flushes re-render this row alone.
struct ChatStreamingReply: View {
    let viewModel: ChatViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChatAssistantHeader()

            if viewModel.streamingText.isEmpty {
                ChatTypingIndicator()
            } else {
                StreamingMarkdownText(source: viewModel.streamingText)
                    .foregroundStyle(Color.adaptiveTextPrimary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Promptomize Assistant is responding"))
        .accessibilityAddTraits(.updatesFrequently)
    }
}

struct ChatTypingIndicator: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20, paused: reduceMotion)) { context in
            let phase = context.date.timeIntervalSinceReferenceDate * 2.4
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { dot in
                    Circle()
                        .fill(Color.adaptiveButtonPrimary)
                        .frame(width: 7, height: 7)
                        .opacity(reduceMotion ? 0.6 : 0.35 + 0.65 * max(0, sin(phase - Double(dot) * 0.7)))
                }
            }
            .padding(.vertical, 6)
        }
        .accessibilityLabel(Text("Thinking"))
    }
}
