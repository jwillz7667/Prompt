//
//  AIDataConsentView.swift
//  Prompt
//
//  Disclosure shown after sign-in and before any AI feature: what is sent,
//  to whom (by category, never by vendor name) and why. Nothing reaches an
//  AI service until the user agrees and the server has recorded it. Also
//  presented over the app when the server rejects an AI request for missing
//  consent; the rejected request retries once the user agrees.
//

import SwiftUI

struct AIDataConsentView: View {
    enum Presentation {
        /// Launch gate after sign-in: declining means signing out or deleting.
        case launchGate
        /// Over the app after a 403 AI_CONSENT_REQUIRED: declining cancels the request.
        case prompt
    }

    @Environment(AuthManager.self) private var authManager
    @Environment(PromptHistoryManager.self) private var historyManager

    let consentStore: AIDataConsentStore
    var presentation: Presentation = .launchGate

    @State private var isConfirmingAccountDeletion = false
    @State private var isSigningOut = false
    @State private var submitError: String?

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
        .alert(
            "Couldn't save your choice",
            isPresented: Binding(
                get: { submitError != nil },
                set: { if !$0 { submitError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(submitError ?? "")
        }
    }

    private func agree() {
        guard let userId = authManager.currentUser?.id else { return }
        Task {
            do {
                try await consentStore.grantConsent(userId: userId)
            } catch {
                submitError = ErrorHandler.shared.mapToAppError(error).userMessage
            }
        }
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
                text: String(localized: "To generate responses, Promptomize sends your prompts, chat messages and any images you attach to third-party AI service providers that process them on our behalf.")
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
            Button(action: agree) {
                ZStack {
                    Text("Agree and Continue")
                        .opacity(consentStore.isSubmitting ? 0 : 1)
                    if consentStore.isSubmitting {
                        ProgressView()
                            .tint(Color.adaptiveTextOnAccent)
                    }
                }
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
            .disabled(isSigningOut || consentStore.isSubmitting)
            .accessibilityIdentifier("consent.agree")

            switch presentation {
            case .launchGate:
                launchGateAlternatives
            case .prompt:
                promptAlternatives
            }
        }
    }

    private var promptAlternatives: some View {
        VStack(spacing: 14) {
            Text("AI features can't work without this. You'll be asked again the next time you use one.")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(Color.adaptiveTextSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Button("Not Now") {
                consentStore.declinePrompt()
            }
            .font(.system(.footnote, design: .rounded, weight: .semibold))
            .foregroundStyle(Color.adaptiveTextSecondary)
            .disabled(consentStore.isSubmitting)
            .accessibilityIdentifier("consent.notNow")
        }
    }

    private var launchGateAlternatives: some View {
        VStack(spacing: 14) {
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
