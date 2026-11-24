//
//  WhatsNewView.swift
//  Prompt
//
//  What's New popup shown once after each app update.
//  Glass-styled card design matching the app's Liquid Glass theme.
//

import SwiftUI

// MARK: - Feature Model

struct WhatsNewFeature: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let description: String
    let iconColor: Color
}

// MARK: - What's New View

struct WhatsNewView: View {
    @Environment(\.colorScheme) private var colorScheme
    let onDismiss: () -> Void

    // Update these each release
    private let features: [WhatsNewFeature] = [
        WhatsNewFeature(
            icon: "bubble.left.and.text.bubble.right.fill",
            title: "AI Chat Assistant",
            description: "Ask questions, draft and rewrite, brainstorm, or get help with code in a full chat alongside the prompt optimizer.",
            iconColor: .brandCyan
        ),
        WhatsNewFeature(
            icon: "crown.fill",
            title: "One Simple Plan",
            description: "Promptomize Premium includes the prompt optimizer and the AI chat assistant. New subscribers can start with a free trial.",
            iconColor: .brandPurple
        ),
        WhatsNewFeature(
            icon: "icloud.fill",
            title: "Your Chats, Everywhere",
            description: "Conversations and results are saved to your account and sync across your devices.",
            iconColor: .green
        ),
        WhatsNewFeature(
            icon: "exclamationmark.bubble.fill",
            title: "Clearer Errors",
            description: "If a reply is interrupted you'll see what happened and your message stays in the composer, ready to resend.",
            iconColor: .orange
        )
    ]

    private var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    var body: some View {
        VStack(spacing: 0) {
            // Drag indicator area
            Spacer().frame(height: 8)

            ScrollView {
                VStack(spacing: 28) {
                    // Header: icon + version
                    headerSection

                    // Feature list
                    VStack(spacing: 16) {
                        ForEach(features) { feature in
                            featureRow(feature)
                        }
                    }
                    .padding(.horizontal, 4)

                    // Continue button
                    continueButton
                        .padding(.top, 8)
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
        }
        .background { LiquidGlassBackground() }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 12) {
            AppBrandMark(size: 72, showsGlassBackdrop: false)

            Text("What's New")
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(Color.adaptiveTextPrimary)

            Text("Version \(currentVersion)")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(Color.adaptiveTextSecondary)
        }
        .padding(.top, 8)
    }

    // MARK: - Feature Row

    private func featureRow(_ feature: WhatsNewFeature) -> some View {
        HStack(alignment: .top, spacing: 16) {
            // Icon circle
            ZStack {
                Circle()
                    .fill(feature.iconColor.opacity(colorScheme == .dark ? 0.2 : 0.12))
                    .frame(width: 44, height: 44)

                Image(systemName: feature.icon)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(feature.iconColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(feature.title)
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(Color.adaptiveTextPrimary)

                Text(feature.description)
                    .font(.system(.subheadline, design: .default))
                    .foregroundStyle(Color.adaptiveTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: colorScheme == .dark
                                    ? [Color.white.opacity(0.12), Color.white.opacity(0.04)]
                                    : [Color.white.opacity(0.9), Color.brandPurple.opacity(0.15)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
        }
        .shadow(
            color: colorScheme == .dark
                ? Color.black.opacity(0.3)
                : Color.brandPurple.opacity(0.08),
            radius: 8, y: 4
        )
    }

    // MARK: - Continue Button

    private var continueButton: some View {
        Button {
            onDismiss()
        } label: {
            Text("Continue")
                .font(.system(.body, design: .rounded, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .foregroundStyle(Color.adaptiveTextOnAccent)
                .background {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color.adaptiveButtonPrimary)
                        .shadow(color: Color.brandCyan.opacity(0.4), radius: 12, y: 6)
                }
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(ElasticButtonStyle())
    }
}

#Preview {
    WhatsNewView {
        print("Dismissed")
    }
}
