//
//  EnhancementOptionsBar.swift
//  Prompt
//
//  Extracted from ContentView: platform chips + context attachment + quick access row.
//

import SwiftUI

struct EnhancementOptionsBar: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit

    @Binding var selectedPlatform: PlatformType?
    @Binding var attachedContext: ProjectContext?
    let onShowTemplates: () -> Void
    let onShowThreads: () -> Void

    @StateObject private var contextService = ContextService.shared
    @State private var showContextPicker = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        VStack(spacing: 8) {
            // Platform selector
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Label("Platform", systemImage: "cpu")
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(textTertiary)

                    platformChip(name: "Any", icon: "globe", isSelected: selectedPlatform == nil) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedPlatform = nil
                        }
                        triggerHaptic(.light)
                    }

                    ForEach(PlatformType.allCases.filter { $0 != .custom }) { platform in
                        platformChip(
                            name: platform.displayName,
                            icon: platform.icon,
                            isSelected: selectedPlatform == platform,
                            platformColor: Color(hex: platform.color)
                        ) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                if selectedPlatform == platform {
                                    selectedPlatform = nil
                                } else {
                                    selectedPlatform = platform
                                    if let modality = platform.associatedModality {
                                        settings.selectedModality = modality
                                        settings.savePreferences()
                                    }
                                }
                            }
                            triggerHaptic(.light)
                        }
                    }
                }
                .padding(.vertical, 8)
            }
            .scrollClipDisabled()

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

                if let limitDesc = selectedPlatform?.promptLimitDescription {
                    HStack(spacing: 3) {
                        Image(systemName: "text.word.spacing")
                            .font(.system(size: 8, weight: .bold))
                        Text(limitDesc)
                            .font(.system(size: 9, weight: .semibold, design: .rounded))
                    }
                    .foregroundStyle(accentColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(accentColor.opacity(0.12))
                    .clipShape(Capsule())
                    .transition(.scale.combined(with: .opacity))
                }

                if selectedPlatform != nil && storeKit.currentTier == .free {
                    HStack(spacing: 3) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 8, weight: .bold))
                        Text("PRO")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.orange.opacity(0.12))
                    .clipShape(Capsule())
                }
            }
            .animation(.spring(response: 0.3), value: attachedContext?.id)

            // Quick access row
            HStack(spacing: 8) {
                Button {
                    onShowTemplates()
                    triggerHaptic(.light)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Start from Template")
                            .font(.system(.caption2, design: .rounded, weight: .semibold))
                    }
                    .foregroundStyle(textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(GlassCapsuleButtonStyle())

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

    // MARK: - Platform Chip

    private func platformChip(
        name: String,
        icon: String,
        isSelected: Bool,
        platformColor: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isSelected ? .white : (platformColor ?? textSecondary))
                Text(name)
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(isSelected ? .white : textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .liquidGlassChip(isSelected: isSelected, accentColor: platformColor ?? accentColor)
        }
        .buttonStyle(.plain)
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
