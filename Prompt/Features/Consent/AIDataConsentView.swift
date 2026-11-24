//
//  AIDataConsentView.swift
//  Prompt
//
//  One-time disclosure shown after sign-in and before any AI feature:
//  what is sent, to whom (by category, never by vendor name) and why.
//  Nothing reaches an AI service until the user agrees.
//

import SwiftUI

struct AIDataConsentView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(PromptHistoryManager.self) private var historyManager

    let consentStore: AIDataConsentStore

    @State private var isConfirmingAccountDeletion = false
    @State private var isSigningOut = false

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 18) {
                    header
                    disclosureCard
                    actions
                }
                .frame(maxWidth: 560)
                .padding(.horizontal, 20)
                .padding(.vertical, 32)
                .frame(maxWidth: .infinity)
            }
        }
        .deleteAccountFlow(isPresented: $isConfirmingAccountDeletion)
    }

    private var header: some View {
        VStack(spacing: 14) {
            AppBrandMark(size: 80, showsGlassBackdrop: true)
            Text("How your content is processed")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(Color.adaptiveTextPrimary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private var disclosureCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            disclosureRow(
                systemImage: "paperplane",
                text: String(localized: "To answer you, Promptomize sends your messages, prompts and any images you attach to third-party AI service providers that process them on our behalf.")
            )
            disclosureRow(
                systemImage: "lock.shield",
                text: String(localized: "Only the content needed to answer each request is sent, and only after you agree here.")
            )
            disclosureRow(
                systemImage: "icloud",
                text: String(localized: "Your chats and history are stored on your account so they sync across your devices. You can delete them, or your whole account, at any time.")
            )
            Link(destination: LegalLinks.privacyPolicy) {
                Label("Read the Privacy Policy", systemImage: "arrow.up.right.square")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
            }
            .accessibilityIdentifier("consent.privacyPolicy")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 24, shadowIntensity: 0.7, borderGlow: true)
    }

    private func disclosureRow(systemImage: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(.body, weight: .semibold))
                .foregroundStyle(Color.brandCyan)
                .frame(width: 24)
                .accessibilityHidden(true)
            Text(text)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(Color.adaptiveTextPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var actions: some View {
        VStack(spacing: 14) {
            Button {
                guard let userId = authManager.currentUser?.id else { return }
                consentStore.recordConsent(userId: userId)
            } label: {
                Text("Agree and Continue")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(Color.adaptiveTextOnAccent)
            }
            .buttonStyle(LiquidGlassButtonStyle(
                cornerRadius: 16,
                tintColor: Color.adaptiveButtonPrimary,
                intensity: .prominent
            ))
            .disabled(isSigningOut)
            .accessibilityIdentifier("consent.agree")

            Text("AI features can't work without this. If you don't agree, you can sign out or delete your account.")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(Color.adaptiveTextSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 20) {
                Button("Not Now, Sign Out") {
                    Task {
                        isSigningOut = true
                        defer { isSigningOut = false }
                        await authManager.signOut()
                        historyManager.clearLocalData()
                    }
                }
                .foregroundStyle(Color.adaptiveTextSecondary)
                .accessibilityIdentifier("consent.signOut")

                Button("Delete Account", role: .destructive) {
                    isConfirmingAccountDeletion = true
                }
                .accessibilityIdentifier("consent.deleteAccount")
            }
            .font(.system(.footnote, design: .rounded, weight: .semibold))
            .disabled(isSigningOut)
        }
    }
}
