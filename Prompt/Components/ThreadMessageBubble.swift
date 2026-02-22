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
    @State private var showCopied = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    /// Accent: cyan in dark mode, purple in light mode (matches app brand)
    private var accentColor: Color { Color.adaptiveButtonPrimary }

    /// Bubble border accent: cyan in dark, purple in light
    private var borderAccent: Color {
        colorScheme == .dark ? Color.brandCyan : Color.brandPurple
    }

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
                            .foregroundStyle(textPrimary)
                            .textSelection(.enabled)
                    }

                    // Bottom row: tokens + copy button for assistant messages
                    if message.role == .assistant {
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

                            // Copy all button
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
                                    Text(showCopied ? "Copied" : "Copy All")
                                        .font(.system(.caption2, design: .rounded, weight: .medium))
                                }
                                .foregroundStyle(showCopied ? accentColor : textSecondary)
                                .contentTransition(.symbolEffect(.replace))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .overlay {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(borderAccent.opacity(colorScheme == .dark ? 0.08 : 0.05))
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(
                                    LinearGradient(
                                        colors: [
                                            borderAccent.opacity(message.role == .user ? 0.6 : 0.4),
                                            borderAccent.opacity(0.15)
                                        ],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    ),
                                    lineWidth: message.role == .user ? 1.5 : 1
                                )
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
