//
//  SharedDataManager.swift
//  PromptKeyboard
//
//  Manages shared data between main app and keyboard extension via App Group
//

import Foundation

/// Manages shared data between the main app and keyboard extension
/// Uses App Group for data sharing
class SharedDataManager {
    static let shared = SharedDataManager()

    private let appGroupId = "group.com.res.promptomizer"

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    private init() {}

    // MARK: - Auth Token

    /// Get the stored access token
    var accessToken: String? {
        get { sharedDefaults?.string(forKey: "accessToken") }
        set { sharedDefaults?.set(newValue, forKey: "accessToken") }
    }

    /// Get the stored refresh token
    var refreshToken: String? {
        get { sharedDefaults?.string(forKey: "refreshToken") }
        set { sharedDefaults?.set(newValue, forKey: "refreshToken") }
    }

    // MARK: - API Configuration

    /// Base URL for API calls
    var apiBaseURL: String {
        get { sharedDefaults?.string(forKey: "apiBaseURL") ?? "https://api.promptomize.app" }
        set { sharedDefaults?.set(newValue, forKey: "apiBaseURL") }
    }

    // MARK: - User Preferences

    /// Selected tone for enhancement
    var selectedTone: String {
        get { sharedDefaults?.string(forKey: "selectedTone") ?? "professional" }
        set { sharedDefaults?.set(newValue, forKey: "selectedTone") }
    }

    /// Output length preference
    var outputLength: String {
        get { sharedDefaults?.string(forKey: "outputLength") ?? "standard" }
        set { sharedDefaults?.set(newValue, forKey: "outputLength") }
    }

    /// Custom instructions
    var customInstructions: String? {
        get { sharedDefaults?.string(forKey: "customInstructions") }
        set { sharedDefaults?.set(newValue, forKey: "customInstructions") }
    }

    // MARK: - User Info

    /// Check if user is signed in
    var isSignedIn: Bool {
        accessToken != nil
    }

    /// User's subscription tier
    var subscriptionTier: String {
        get { sharedDefaults?.string(forKey: "subscriptionTier") ?? "free" }
        set { sharedDefaults?.set(newValue, forKey: "subscriptionTier") }
    }

    // MARK: - Clear Data

    /// Clear all shared data (on logout)
    func clearAll() {
        accessToken = nil
        refreshToken = nil
        customInstructions = nil
    }
}
