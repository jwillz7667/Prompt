//
//  EnhancementOptionsBar.swift
//  Prompt
//
//  Extracted from ContentView: platform chips + context attachment + quick access row.
//

import SwiftUI

struct EnhancementOptionsBar: View {
    @Environment(\.colorScheme) private var colorScheme

    @Binding var attachedContext: ProjectContext?
    let onShowThreads: () -> Void

    @StateObject private var contextService = ContextService.shared
    @State private var showContextPicker = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        VStack(spacing: 8) {
            // Context attachment row
            HStack(spacing: 8) {
                if let context = attachedContext {
                    HStack(spacing: 6) {
                        Image(systemName: context.isGlobal ? "globe" : "folder.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(accentColor)
                        Text(context.name)
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(textPrimary)
                            .lineLimit(1)
                        Button {
                            withAnimation(.spring(response: 0.3)) { attachedContext = nil }
                            triggerHaptic(.light)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(textTertiary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .liquidGlassChip(isSelected: true, accentColor: accentColor)
                    .transition(.scale.combined(with: .opacity))
                } else if !contextService.contexts.isEmpty {
                    Button {
                        showContextPicker = true
                        triggerHaptic(.light)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus.circle")
                                .font(.system(size: 12, weight: .medium))
                            Text("Attach Context")
                                .font(.system(.caption, design: .rounded, weight: .medium))
                        }
                        .foregroundStyle(textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(GlassCapsuleButtonStyle())
                }

                Spacer()
            }
            .animation(.spring(response: 0.3), value: attachedContext?.id)

            // Quick access row
            HStack(spacing: 8) {
                Button {
                    onShowThreads()
                    triggerHaptic(.light)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Continue Thread")
                            .font(.system(.caption2, design: .rounded, weight: .semibold))
                    }
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(GlassCapsuleButtonStyle())

                Spacer()
            }
        }
        .popover(isPresented: $showContextPicker) {
            contextPickerPopover
                .frame(width: 280, height: 300)
                .presentationCompactAdaptation(.popover)
        }
        .task { await contextService.loadContextsIfNeeded() }
    }
    // MARK: - Context Picker

    private var contextPickerPopover: some View {
        NavigationStack {
            List(contextService.contexts) { context in
                Button {
                    withAnimation(.spring(response: 0.3)) { attachedContext = context }
                    showContextPicker = false
                    triggerHaptic(.light)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: context.isGlobal ? "globe" : "folder.fill")
                            .foregroundStyle(accentColor)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.name)
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(textPrimary)
                            if let desc = context.description, !desc.isEmpty {
                                Text(desc)
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(textSecondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                        if attachedContext?.id == context.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(accentColor)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Attach Context")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Haptic

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}
