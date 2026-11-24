//
//  GuestSessionManager.swift
//  Prompt
//
//  Legacy guest-mode state. Sign in with Apple is now required before the
//  app shell is shown (RootView), so nothing here gates access any more. It
//  remains only while ThreadView, ChatSidebarView and OptimizeSheet still
//  read it from the environment; delete it together with those references.
//

import Foundation
import Observation

@Observable
@MainActor
final class GuestSessionManager {
    static let shared = GuestSessionManager()

    private(set) var quota: GuestQuotaState = .initial
    private(set) var shouldPresentAuthenticationGate = false

    private init() {}

    /// Signed-out users are already on the required sign-in screen, so a
    /// request for the legacy sign-in cover only records the intent.
    func presentAuthenticationGate() {
        shouldPresentAuthenticationGate = true
    }
}
