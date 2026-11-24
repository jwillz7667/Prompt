//
//  DeleteAccountFlow.swift
//  Prompt
//
//  Confirmation, App Store billing notice, progress and error handling for
//  account deletion (App Review 5.1.1(v)). Shared by Settings, the hard
//  paywall and the entitlement check screen, so an account can be deleted
//  whether or not it ever subscribed.
//

import StoreKit
import SwiftUI

private struct DeleteAccountFlow: ViewModifier {
    @Binding var isPresented: Bool
    let onDeleted: @MainActor () -> Void

    @Environment(AuthManager.self) private var authManager
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(PromptHistoryManager.self) private var historyManager

    private enum Failure: Equatable {
        case deletion(reason: String)
        case manageSubscriptions

        var title: String {
            switch self {
            case .deletion: return String(localized: "Couldn't Delete Account")
            case .manageSubscriptions: return String(localized: "Couldn't Open Subscriptions")
            }
        }

        var message: String {
            switch self {
            case .deletion(let reason):
                return String(localized: "Your account was not deleted. \(reason)")
            case .manageSubscriptions:
                return String(localized: "Go to Settings > Apple Account > Subscriptions.")
            }
        }
    }

    @State private var isDeleting = false
    @State private var failure: Failure?

    /// Deleting the account never cancels an App Store subscription, and
    /// Apple asks apps to say so before deletion.
    private var hasAppStoreSubscription: Bool {
        storeKit.isEntitled && storeKit.billingProvider != "stripe"
    }

    private var confirmationMessage: String {
        let base = String(localized: "This permanently deletes your account, chats and history. It can't be undone.")
        guard hasAppStoreSubscription else { return base }
        let billing = String(localized: "Deleting your account doesn't cancel your App Store subscription. To stop billing, cancel it in Settings > Apple Account > Subscriptions.")
        return base + "\n\n" + billing
    }

    func body(content: Content) -> some View {
        content
            .overlay {
                if isDeleting {
                    ZStack {
                        Color.black.opacity(0.25).ignoresSafeArea()
                        ProgressView(String(localized: "Deleting account…"))
                            .padding(20)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    }
                }
            }
            .alert("Delete Account?", isPresented: $isPresented) {
                Button("Cancel", role: .cancel) {}
                if hasAppStoreSubscription {
                    Button("Manage Subscription") {
                        Task { await showManageSubscriptions() }
                    }
                }
                Button("Delete", role: .destructive) {
                    Task { await deleteAccount() }
                }
            } message: {
                Text(confirmationMessage)
            }
            .alert(
                failure?.title ?? "",
                isPresented: Binding(
                    get: { failure != nil },
                    set: { if !$0 { failure = nil } }
                ),
                presenting: failure
            ) { presented in
                if case .deletion = presented {
                    Button("Cancel", role: .cancel) {}
                    Button("Try Again") {
                        Task { await deleteAccount() }
                    }
                } else {
                    Button("OK", role: .cancel) {}
                }
            } message: { presented in
                Text(presented.message)
            }
    }

    private func deleteAccount() async {
        guard !isDeleting else { return }
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await authManager.deleteAccount()
            historyManager.clearLocalData()
            onDeleted()
        } catch {
            ErrorHandler.shared.handleSilently(error, context: "deleteAccount")
            failure = .deletion(reason: ErrorHandler.shared.mapToAppError(error).userMessage)
        }
    }

    private func showManageSubscriptions() async {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else { return }
        do {
            try await AppStore.showManageSubscriptions(in: scene)
        } catch {
            ErrorHandler.shared.handleSilently(error, context: "deleteAccount.manageSubscriptions")
            failure = .manageSubscriptions
        }
    }
}

extension View {
    /// Attaches the account deletion flow. Set `isPresented` to start it;
    /// `onDeleted` runs after the server confirmed deletion and local data
    /// was cleared.
    func deleteAccountFlow(
        isPresented: Binding<Bool>,
        onDeleted: @escaping @MainActor () -> Void = {}
    ) -> some View {
        modifier(DeleteAccountFlow(isPresented: isPresented, onDeleted: onDeleted))
    }
}
