//
//  ChatOptionsSheet.swift
//  Prompt
//
//  Bottom sheet triggered by the + button, showing recent threads and enhancement features.
//  Structural layout inspired by ChatGPT's options menu with Promptomize brand styling.
//

import SwiftUI

struct ChatOptionsSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(AuthManager.self) private var authManager

    @Bindable var threadViewModel: ThreadViewModel
    let onSelectThread: (String) -> Void
    let onShowCamera: () -> Void
    let onShowPhotoPicker: () -> Void
    let onShowFilePicker: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Promptomize")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)

                Spacer()

                Button {
                    dismiss()
                    onShowPhotoPicker()
                } label: {
                    Text("All Photos")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(accentColor)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)

            // Recent threads horizontal scroll
            if !threadViewModel.threads.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        // Camera card
                        Button {
                            dismiss()
                            onShowCamera()
                        } label: {
                            VStack {
                                Image(systemName: "camera.fill")
                                    .font(.system(size: 28, weight: .medium))
                                    .foregroundStyle(textSecondary)
                            }
                            .frame(width: 120, height: 120)
                            .background {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color.adaptiveBackgroundTertiary)
                            }
                        }
                        .buttonStyle(.plain)

                        // Recent thread cards
                        ForEach(threadViewModel.threads.prefix(8)) { thread in
                            Button {
                                dismiss()
                                onSelectThread(thread.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(thread.title)
                                        .font(.system(.caption, design: .rounded, weight: .semibold))
                                        .foregroundStyle(textPrimary)
                                        .lineLimit(3)

                                    if let preview = thread.lastPreview, !preview.isEmpty {
                                        Text(preview)
                                            .font(.system(.caption2, design: .rounded))
                                            .foregroundStyle(textSecondary)
                                            .lineLimit(3)
                                    }

                                    Spacer(minLength: 0)
                                }
                                .padding(12)
                                .frame(width: 140, height: 120, alignment: .topLeading)
                                .background {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(Color.adaptiveBackgroundTertiary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 16)
            }

            // Divider
            Rectangle()
                .fill(Color.adaptiveBorder.opacity(0.3))
                .frame(height: 0.5)
                .padding(.horizontal, 20)
                .padding(.bottom, 8)

            // Feature options list
            ScrollView {
                VStack(spacing: 0) {
                    featureRow(
                        icon: "photo.artframe",
                        iconColor: .pink,
                        title: "Image prompt",
                        subtitle: "Generate stunning image prompts"
                    ) {
                        settings.selectedModality = .image
                        settings.savePreferences()
                        dismiss()
                    }

                    featureRow(
                        icon: "video.fill",
                        iconColor: .red,
                        title: "Video prompt",
                        subtitle: "Create cinematic video descriptions"
                    ) {
                        settings.selectedModality = .video
                        settings.savePreferences()
                        dismiss()
                    }

                    featureRow(
                        icon: "chevron.left.forwardslash.chevron.right",
                        iconColor: .green,
                        title: "Code prompt",
                        subtitle: "Craft precise coding instructions"
                    ) {
                        settings.selectedModality = .code
                        settings.savePreferences()
                        dismiss()
                    }

                    featureRow(
                        icon: "music.note",
                        iconColor: .orange,
                        title: "Audio prompt",
                        subtitle: "Design audio and music prompts"
                    ) {
                        settings.selectedModality = .audio
                        settings.savePreferences()
                        dismiss()
                    }

                    featureRow(
                        icon: "cube.fill",
                        iconColor: .blue,
                        title: "3D prompt",
                        subtitle: "Build 3D model descriptions"
                    ) {
                        settings.selectedModality = .threeD
                        settings.savePreferences()
                        dismiss()
                    }

                    featureRow(
                        icon: "flame.fill",
                        iconColor: .orange,
                        title: "MAX mode",
                        subtitle: "Deeper reasoning for complex prompts"
                    ) {
                        settings.maxModeEnabled.toggle()
                        settings.savePreferences()
                        dismiss()
                    }

                    featureRow(
                        icon: "doc.on.clipboard",
                        iconColor: accentColor,
                        title: "Paste from clipboard",
                        subtitle: "Import text or images"
                    ) {
                        dismiss()
                    }

                    featureRow(
                        icon: "folder.fill",
                        iconColor: .teal,
                        title: "Import file",
                        subtitle: "Load text from a file"
                    ) {
                        dismiss()
                        onShowFilePicker()
                    }
                }
            }
        }
        .background(Color.adaptiveBackgroundSecondary)
    }

    private func featureRow(
        icon: String,
        iconColor: Color,
        title: String,
        subtitle: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(iconColor)
                    .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(.body, design: .rounded, weight: .semibold))
                        .foregroundStyle(textPrimary)

                    Text(subtitle)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(textSecondary)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
    }
}
