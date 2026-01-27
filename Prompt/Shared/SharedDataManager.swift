//
//  SharedDataManager.swift
//  Prompt
//
//  Manages shared data between main app and extensions via App Groups
//

import Foundation
import WidgetKit

final class SharedDataManager: @unchecked Sendable {
    static let shared = SharedDataManager()

    // MARK: - Constants

    static let appGroupIdentifier = "group.com.res.promptomizer"

    private enum Keys {
        static let dailyPromptsUsed = "dailyPromptsUsed"
        static let dailyPromptsLimit = "dailyPromptsLimit"
        static let subscriptionTier = "subscriptionTier"
        static let lastEnhancedPrompt = "lastEnhancedPrompt"
        static let lastEnhancedPromptOriginal = "lastEnhancedPromptOriginal"
        static let lastEnhancedPromptDate = "lastEnhancedPromptDate"
        static let currentActivityId = "currentActivityId"
        static let recentPrompts = "recentPrompts"
        static let isAuthenticated = "isAuthenticated"
        static let userName = "userName"
        static let userEmail = "userEmail"
    }

    // MARK: - User Defaults

    private let defaults: UserDefaults?

    private init() {
        defaults = UserDefaults(suiteName: Self.appGroupIdentifier)
    }

    // MARK: - Quota Data

    var dailyPromptsUsed: Int {
        get { defaults?.integer(forKey: Keys.dailyPromptsUsed) ?? 0 }
        set { defaults?.set(newValue, forKey: Keys.dailyPromptsUsed) }
    }

    var dailyPromptsLimit: Int {
        get {
            let value = defaults?.integer(forKey: Keys.dailyPromptsLimit) ?? 10
            return value == 0 ? 10 : value
        }
        set { defaults?.set(newValue, forKey: Keys.dailyPromptsLimit) }
    }

    var remainingPrompts: Int {
        if dailyPromptsLimit == -1 { return Int.max }
        return max(0, dailyPromptsLimit - dailyPromptsUsed)
    }

    var isUnlimited: Bool {
        dailyPromptsLimit == -1
    }

    var usagePercentage: Double {
        if isUnlimited { return 0 }
        guard dailyPromptsLimit > 0 else { return 1.0 }
        return Double(dailyPromptsUsed) / Double(dailyPromptsLimit)
    }

    // MARK: - Subscription Data

    var subscriptionTier: String {
        get { defaults?.string(forKey: Keys.subscriptionTier) ?? "FREE" }
        set { defaults?.set(newValue, forKey: Keys.subscriptionTier) }
    }

    var isPremium: Bool {
        subscriptionTier != "FREE"
    }

    // MARK: - Recent Prompt Data

    var lastEnhancedPrompt: String? {
        get { defaults?.string(forKey: Keys.lastEnhancedPrompt) }
        set { defaults?.set(newValue, forKey: Keys.lastEnhancedPrompt) }
    }

    var lastEnhancedPromptOriginal: String? {
        get { defaults?.string(forKey: Keys.lastEnhancedPromptOriginal) }
        set { defaults?.set(newValue, forKey: Keys.lastEnhancedPromptOriginal) }
    }

    var lastEnhancedPromptDate: Date? {
        get { defaults?.object(forKey: Keys.lastEnhancedPromptDate) as? Date }
        set { defaults?.set(newValue, forKey: Keys.lastEnhancedPromptDate) }
    }

    // MARK: - Live Activity Data

    var currentActivityId: String? {
        get { defaults?.string(forKey: Keys.currentActivityId) }
        set { defaults?.set(newValue, forKey: Keys.currentActivityId) }
    }

    // MARK: - Recent Prompts (for Widget)

    struct RecentPrompt: Codable, Sendable {
        let id: String
        let original: String
        let enhanced: String
        let date: Date
    }

    var recentPrompts: [RecentPrompt] {
        get {
            guard let data = defaults?.data(forKey: Keys.recentPrompts),
                  let prompts = try? JSONDecoder().decode([RecentPrompt].self, from: data) else {
                return []
            }
            return prompts
        }
        set {
            let limitedPrompts = Array(newValue.prefix(5))
            if let data = try? JSONEncoder().encode(limitedPrompts) {
                defaults?.set(data, forKey: Keys.recentPrompts)
            }
        }
    }

    func addRecentPrompt(id: String, original: String, enhanced: String) {
        var prompts = recentPrompts
        let newPrompt = RecentPrompt(id: id, original: original, enhanced: enhanced, date: Date())
        prompts.insert(newPrompt, at: 0)
        recentPrompts = prompts

        lastEnhancedPrompt = enhanced
        lastEnhancedPromptOriginal = original
        lastEnhancedPromptDate = Date()
    }

    // MARK: - Authentication State

    var isAuthenticated: Bool {
        get { defaults?.bool(forKey: Keys.isAuthenticated) ?? false }
        set { defaults?.set(newValue, forKey: Keys.isAuthenticated) }
    }

    var userName: String? {
        get { defaults?.string(forKey: Keys.userName) }
        set { defaults?.set(newValue, forKey: Keys.userName) }
    }

    var userEmail: String? {
        get { defaults?.string(forKey: Keys.userEmail) }
        set { defaults?.set(newValue, forKey: Keys.userEmail) }
    }

    // MARK: - Update Methods

    func updateQuota(used: Int, limit: Int) {
        dailyPromptsUsed = used
        dailyPromptsLimit = limit
    }

    func updateSubscription(tier: String) {
        subscriptionTier = tier
    }

    func updateAuthState(isAuthenticated: Bool, name: String?, email: String?) {
        self.isAuthenticated = isAuthenticated
        self.userName = name
        self.userEmail = email
    }

    func clearAllData() {
        let keys = [
            Keys.dailyPromptsUsed,
            Keys.dailyPromptsLimit,
            Keys.subscriptionTier,
            Keys.lastEnhancedPrompt,
            Keys.lastEnhancedPromptOriginal,
            Keys.lastEnhancedPromptDate,
            Keys.currentActivityId,
            Keys.recentPrompts,
            Keys.isAuthenticated,
            Keys.userName,
            Keys.userEmail
        ]

        for key in keys {
            defaults?.removeObject(forKey: key)
        }
        reloadWidgets()
    }

    // MARK: - Widget Reload

    /// Reload all widgets to reflect updated data
    func reloadWidgets() {
        #if !WIDGET_EXTENSION
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    /// Reload specific widget kinds
    func reloadWidget(kind: String) {
        #if !WIDGET_EXTENSION
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
        #endif
    }

    // Widget kind identifiers
    static let quotaWidgetKind = "QuotaWidget"
    static let quickEnhanceWidgetKind = "QuickEnhanceWidget"
}
