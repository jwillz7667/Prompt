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

    @Environment(\.colorScheme) private var colorScheme

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if message.role == .user {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 6) {
                // Role label
                HStack(spacing: 4) {
                    if message.role == .assistant {
                        Image(systemName: "sparkles")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(accentColor)
                    }
                    Text(message.role == .user ? "You" : "Enhanced")
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(textSecondary)
                }

                // Message content
                VStack(alignment: .leading, spacing: 8) {
                    if message.role == .assistant {
                        Text(message.content)
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(textPrimary)
                            .textSelection(.enabled)
                    } else {
                        Text(message.content)
                            .font(.system(.body))
                            .foregroundStyle(.white)
                            .textSelection(.enabled)
                    }

                    // Token count for assistant messages
                    if message.role == .assistant, let tokens = message.tokens, tokens > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkle")
                                .font(.system(size: 9))
                            Text("\(tokens) tokens")
                                .font(.system(.caption2, design: .rounded))
                        }
                        .foregroundStyle(textSecondary)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background {
                    if message.role == .user {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color.brandPurple)
                    } else {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(.ultraThinMaterial)
                            .overlay {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(accentColor.opacity(colorScheme == .dark ? 0.08 : 0.05))
                            }
                            .overlay {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(accentColor.opacity(0.2), lineWidth: 1)
                            }
                    }
                }
                .if(message.role == .assistant) { view in
                    view.contextMenu {
                        Button {
                            UIPasteboard.general.string = message.content
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                    }
                }

                // Streaming indicator
                if isStreaming && message.id == "streaming" {
                    HStack(spacing: 4) {
                        ProgressView()
                            .scaleEffect(0.6)
                        Text("Enhancing...")
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
}

// MARK: - Conditional View Modifier

private extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}
