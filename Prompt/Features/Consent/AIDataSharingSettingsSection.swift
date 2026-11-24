//
//  AIDataSharingSettingsSection.swift
//  Prompt
//
//  Settings control for the AI data-sharing consent. Turning it off withdraws
//  the consent on the server; the launch gate then shows the consent screen
//  before any further AI use, since every feature depends on it.
//

import SwiftUI

struct AIDataSharingSettingsSection: View {
    @Environment(AuthManager.self) private var authManager

    var consentStore: AIDataConsentStore = .shared

    @State private var isConfirmingWithdrawal = false
    @State private var withdrawalError: String?

    private var isConsented: Bool {
        guard let userId = authManager.currentUser?.id else { return false }
        return consentStore.hasConsented(userId: userId)
    }

    var body: some View {
        Section {
            Toggle(isOn: Binding(
                get: { isConsented },
                set: { isOn in
                    if !isOn { isConfirmingWithdrawal = true }
                }
            )) {
                Label("Share content with AI providers", systemImage: "paperplane")
                    .foregroundStyle(Color.adaptiveTextPrimary)
            }
            // Granting happens on the consent screen, which shows the full
            // disclosure; this switch only withdraws.
            .disabled(!isConsented || consentStore.isSubmitting)
            .listRowBackground(Color.adaptiveBackgroundSecondary)
            .accessibilityIdentifier("settings.aiDataSharing")
        } header: {
            Text("AI Data Sharing")
                .foregroundStyle(Color.adaptiveTextSecondary)
        } footer: {
            Text("Your prompts, chat messages and attached images are sent to third-party AI service providers to generate responses. Turning this off stops all AI features until you agree again.")
                .foregroundStyle(Color.adaptiveTextSecondary)
        }
        .confirmationDialog(
            "Stop sharing content with AI providers?",
            isPresented: $isConfirmingWithdrawal,
            titleVisibility: .visible
        ) {
            Button("Turn Off", role: .destructive, action: withdraw)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("AI features won't work until you agree again.")
        }
        .alert(
            "Couldn't update AI data sharing",
            isPresented: Binding(
                get: { withdrawalError != nil },
                set: { if !$0 { withdrawalError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(withdrawalError ?? "")
        }
    }

    private func withdraw() {
        guard let userId = authManager.currentUser?.id else { return }
        Task {
            do {
                try await consentStore.withdrawConsent(userId: userId)
            } catch {
                withdrawalError = ErrorHandler.shared.mapToAppError(error).userMessage
            }
        }
    }
}
