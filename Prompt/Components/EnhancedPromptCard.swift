//
//  EnhancedPromptCard.swift
//  Prompt
//
//  Extracted from ContentView: enhanced prompt display + action buttons.
//

import SwiftUI

struct EnhancedPromptCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let enhancedPrompt: String
    let tokensUsed: Int
    let isCurrentPromptFavorite: Bool
    let onCopy: () -> Void
    let onSave: () -> Void
    let onShare: () -> Void
    let onStartThread: () -> Void
    let onClear: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Label("Enhanced Prompt", systemImage: "sparkles")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Spacer()

                if tokensUsed > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkle")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(accentColor)
                        Text("\(tokensUsed) tokens")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(textSecondary)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(accentColor.opacity(0.15))
                    .clipShape(Capsule())
                }
            }

            // Enhanced prompt text
            ScrollView {
                Text(enhancedPrompt)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 180, maxHeight: 300)
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(accentColor.opacity(colorScheme == .dark ? 0.08 : 0.05))
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                accentColor.opacity(0.5),
                                accentColor.opacity(0.2),
                                accentColor.opacity(0.3)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1.5
                    )
            }
            .shadow(color: accentColor.opacity(0.2), radius: 20, y: 8)

            // Action buttons
            actionButtons
        }
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        VStack(spacing: 12) {
            // Primary action - Copy button
            Button {
                onCopy()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "doc.on.doc.fill")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Copy Prompt")
                        .font(.system(.body, design: .rounded, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(colorScheme == .dark ? .black : .white)
            }
            .buttonStyle(LiquidGlassButtonStyle(
                cornerRadius: 12,
                tintColor: colorScheme == .dark ? accentColor : Color.brandPurple,
                intensity: .prominent
            ))

            // Utility row: Save, Share, Thread, Clear
            HStack(spacing: 8) {
                Button {
                    onSave()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: isCurrentPromptFavorite ? "star.fill" : "star")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(isCurrentPromptFavorite ? .yellow : textSecondary)
                        Text(isCurrentPromptFavorite ? "Saved" : "Save")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                }
                .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

                ShareLink(item: enhancedPrompt) {
                    HStack(spacing: 5) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 13, weight: .medium))
                        Text("Share")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .foregroundStyle(textSecondary)
                }
                .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

                Button {
                    onStartThread()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 13, weight: .medium))
                        Text("Thread")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .foregroundStyle(textSecondary)
                }
                .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))

                Button {
                    onClear()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13, weight: .medium))
                        Text("Clear")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .foregroundStyle(textSecondary)
                }
                .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 10))
            }
        }
    }
}
