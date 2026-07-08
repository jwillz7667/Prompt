//
//  ThreadMessageBubble.swift
//  Prompt
//
//  Chat bubble component for thread conversation messages
//

import SwiftUI

struct ThreadMessageBubble: View {
    let message: ThreadMessage
    let isStreaming: Bool
    /// When set, an "Optimize" affordance appears in the assistant action row
    /// (reflection-loop optimizer entry point). Callers pass nil to hide it.
    var onOptimize: (() -> Void)? = nil

    @State private var showCopied = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    /// Accent: cyan in dark mode, purple in light mode
    private var accentColor: Color { Color.adaptiveButtonPrimary }

    private var assistantResponseMode: ThreadConversationMode {
        message.responseMode ?? .optimize
    }

    private var assistantLabel: String {
        assistantResponseMode == .chat ? "Assistant" : "Enhanced"
    }

    private var assistantIcon: String {
        assistantResponseMode == .chat ? "bubble.left.and.bubble.right.fill" : "sparkles"
    }

    private var assistantCopyLabel: String {
        assistantResponseMode == .chat ? "Copy Reply" : "Copy Prompt"
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            if message.role == .user {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                // Role label
                HStack(spacing: 4) {
                    if message.role == .assistant {
                        Image(systemName: assistantIcon)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(accentColor)
                    }
                    Text(message.role == .user ? "You" : assistantLabel)
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(textSecondary)
                }

                // Message bubble
                if message.role == .user {
                    userBubble
                } else {
                    assistantBubble
                }

                // Streaming indicator
                if isStreaming && message.id == "streaming" {
                    HStack(spacing: 4) {
                        ProgressView()
                            .scaleEffect(0.6)
                        Text(assistantResponseMode == .chat ? "Thinking..." : "Enhancing...")
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(textSecondary)
                    }
                }
            }

            if message.role == .assistant {
                Spacer(minLength: 40)
            }
        }
    }

    // MARK: - User Bubble (solid accent, iMessage-style)

    private var userBubble: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if let attachment = message.imageAttachment {
                PromptImageAttachmentCard(
                    attachment: attachment,
                    height: 190,
                    showsAnalysisBadge: false
                )
                .frame(maxWidth: 240)
            }

            if !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(message.content)
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .textSelection(.enabled)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(accentColor)
                    )
            }
        }
    }

    // MARK: - Assistant Bubble (glass + accent outline)

    private var assistantBubble: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message.content)
                .font(.system(.body, design: .rounded))
                .foregroundStyle(textPrimary)
                .textSelection(.enabled)

            // Bottom row: tokens + copy button
            HStack(spacing: 8) {
                if let tokens = message.tokens, tokens > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkle")
                            .font(.system(size: 9))
                        Text("\(tokens) tokens")
                            .font(.system(.caption2, design: .rounded))
                    }
                    .foregroundStyle(textSecondary)
                }

                Spacer()

                if let onOptimize {
                    Button {
                        onOptimize()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "wand.and.rays")
                                .font(.system(size: 10, weight: .medium))
                            Text("Optimize")
                                .font(.system(.caption2, design: .rounded, weight: .medium))
                        }
                        .foregroundStyle(textSecondary)
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    UIPasteboard.general.string = message.content
                    withAnimation(.spring(response: 0.3)) {
                        showCopied = true
                    }
                    let generator = UIImpactFeedbackGenerator(style: .light)
                    generator.impactOccurred()
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        withAnimation(.easeOut(duration: 0.2)) {
                            showCopied = false
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: showCopied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 10, weight: .medium))
                        Text(showCopied ? "Copied" : assistantCopyLabel)
                            .font(.system(.caption2, design: .rounded, weight: .medium))
                    }
                    .foregroundStyle(showCopied ? accentColor : textSecondary)
                    .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .liquidGlassInput(cornerRadius: 20, isFocused: false)
    }
}
