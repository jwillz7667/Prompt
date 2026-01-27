//
//  DeeplinkManager.swift
//  Prompt
//
//  Handles deeplink navigation from widgets, notifications, and external sources
//

import SwiftUI

@Observable
@MainActor
final class DeeplinkManager {
    static let shared = DeeplinkManager()

    // Navigation triggers
    var shouldOpenEnhance = false
    var promptIdToOpen: String?
    var shouldOpenHistory = false
    var shouldOpenSettings = false
    var shouldOpenPaywall = false

    // Pending deeplink (stored until app is ready)
    private var pendingURL: URL?

    private init() {}

    // MARK: - URL Handling

    /// Process incoming deeplink URL
    /// Returns true if the URL was handled
    @discardableResult
    func handleURL(_ url: URL) -> Bool {
        guard url.scheme == "promptomize" else { return false }

        let host = url.host ?? ""
        let pathComponents = url.pathComponents.filter { $0 != "/" }

        switch host {
        case "enhance", "":
            // promptomize://enhance or promptomize:// (default)
            if pathComponents.isEmpty || host == "enhance" {
                shouldOpenEnhance = true
                return true
            }

        case "prompt":
            // promptomize://prompt/{id}
            if let promptId = pathComponents.first {
                promptIdToOpen = promptId
                shouldOpenHistory = true
                return true
            }

        case "history":
            // promptomize://history
            shouldOpenHistory = true
            return true

        case "settings":
            // promptomize://settings
            shouldOpenSettings = true
            return true

        case "upgrade", "paywall":
            // promptomize://upgrade or promptomize://paywall
            shouldOpenPaywall = true
            return true

        default:
            break
        }

        #if DEBUG
        print("[Deeplink] Unhandled URL: \(url)")
        #endif
        return false
    }

    /// Store a pending URL for later processing (when app is not ready)
    func storePendingURL(_ url: URL) {
        pendingURL = url
    }

    /// Process any pending URL
    func processPendingURL() {
        guard let url = pendingURL else { return }
        pendingURL = nil
        handleURL(url)
    }

    /// Reset all navigation triggers
    func reset() {
        shouldOpenEnhance = false
        promptIdToOpen = nil
        shouldOpenHistory = false
        shouldOpenSettings = false
        shouldOpenPaywall = false
    }

    /// Clear specific trigger after handling
    func clearEnhanceTrigger() {
        shouldOpenEnhance = false
    }

    func clearHistoryTrigger() {
        shouldOpenHistory = false
        promptIdToOpen = nil
    }

    func clearSettingsTrigger() {
        shouldOpenSettings = false
    }

    func clearPaywallTrigger() {
        shouldOpenPaywall = false
    }
}
