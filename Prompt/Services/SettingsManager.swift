//
//  SettingsManager.swift
//  Prompt
//
//  Manages user preferences for prompt enhancement
//

import Foundation
import SwiftUI
import Observation

// MARK: - Appearance Mode

enum AppearanceMode: String, CaseIterable, Identifiable {
    case system = "system"
    case light = "light"
    case dark = "dark"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

// MARK: - Tone Type

enum ToneType: String, CaseIterable, Identifiable, Codable, Sendable {
    case professional = "professional"
    case casual = "casual"
    case academic = "academic"
    case creative = "creative"
    case technical = "technical"
    case friendly = "friendly"
    case unchained = "unchained"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .professional: return "Professional"
        case .casual: return "Casual"
        case .academic: return "Academic"
        case .creative: return "Creative"
        case .technical: return "Technical"
        case .friendly: return "Friendly"
        case .unchained: return "Unchained"
        }
    }

    var icon: String {
        switch self {
        case .professional: return "briefcase.fill"
        case .casual: return "cup.and.saucer.fill"
        case .academic: return "graduationcap.fill"
        case .creative: return "paintbrush.fill"
        case .technical: return "wrench.and.screwdriver.fill"
        case .friendly: return "heart.fill"
        case .unchained: return "bolt.shield.fill"
        }
    }

    var description: String {
        switch self {
        case .professional: return "Formal, business-appropriate"
        case .casual: return "Relaxed, conversational"
        case .academic: return "Scholarly, research-oriented"
        case .creative: return "Imaginative, expressive"
        case .technical: return "Precise, detail-oriented"
        case .friendly: return "Warm, supportive"
        case .unchained: return "Maximum prompt engineering"
        }
    }

    /// Whether this tone requires premium subscription
    var isPremium: Bool {
        self == .unchained
    }
}

// MARK: - Output Length

enum OutputLength: String, CaseIterable, Identifiable, Codable, Sendable {
    case concise = "concise"
    case standard = "standard"
    case detailed = "detailed"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .concise: return "Concise"
        case .standard: return "Standard"
        case .detailed: return "Detailed"
        }
    }

    var icon: String {
        switch self {
        case .concise: return "text.alignleft"
        case .standard: return "text.justify"
        case .detailed: return "doc.text.fill"
        }
    }

    var description: String {
        switch self {
        case .concise: return "Brief, to the point"
        case .standard: return "Balanced detail"
        case .detailed: return "Comprehensive"
        }
    }
}

@Observable
final class SettingsManager {
    var selectedModel: DeepseekModel = .chat
    var deepThinkEnabled: Bool = false
    var unchainedEnabled: Bool = false
    var temperature: Double = 0.7
    var maxTokens: Int = 8192
    var appearanceMode: AppearanceMode = .system

    // Enhancement controls
    var selectedTone: ToneType = .professional
    var outputLength: OutputLength = .standard
    var customInstructions: String = ""

    /// Returns the effective tone - unchained if enabled, otherwise selected tone
    var effectiveTone: ToneType {
        unchainedEnabled ? .unchained : selectedTone
    }

    // App Group for sharing with keyboard extension AND persistence across updates
    private let appGroupId = "group.com.res.promptomizer"
    private var appGroupDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // Keys for settings
    private enum Keys {
        static let deepThinkEnabled = "deepThinkEnabled"
        static let unchainedEnabled = "unchainedEnabled"
        static let temperature = "temperature"
        static let maxTokens = "maxTokens"
        static let appearanceMode = "appearanceMode"
        static let selectedTone = "selectedTone"
        static let outputLength = "outputLength"
        static let customInstructions = "customInstructions"
        static let settingsMigrated = "settingsMigratedToAppGroup"
    }

    init() {
        migrateToAppGroupIfNeeded()
        loadPreferences()
    }

    // MARK: - Computed Properties

    /// Returns the actual model to use based on Deep Think setting
    var effectiveModel: DeepseekModel {
        deepThinkEnabled ? .reasoner : .chat
    }

    // MARK: - Migration

    /// Migrate settings from standard UserDefaults to App Group (one-time)
    private func migrateToAppGroupIfNeeded() {
        guard let defaults = appGroupDefaults else { return }

        // Check if already migrated
        if defaults.bool(forKey: Keys.settingsMigrated) { return }

        #if DEBUG
        print("[Settings] Migrating settings to App Group")
        #endif

        // Migrate each setting if it exists in standard UserDefaults
        if UserDefaults.standard.object(forKey: Keys.deepThinkEnabled) != nil {
            defaults.set(UserDefaults.standard.bool(forKey: Keys.deepThinkEnabled), forKey: Keys.deepThinkEnabled)
        }
        if UserDefaults.standard.double(forKey: Keys.temperature) > 0 {
            defaults.set(UserDefaults.standard.double(forKey: Keys.temperature), forKey: Keys.temperature)
        }
        if UserDefaults.standard.integer(forKey: Keys.maxTokens) > 0 {
            defaults.set(UserDefaults.standard.integer(forKey: Keys.maxTokens), forKey: Keys.maxTokens)
        }
        if let value = UserDefaults.standard.string(forKey: Keys.appearanceMode) {
            defaults.set(value, forKey: Keys.appearanceMode)
        }
        if let value = UserDefaults.standard.string(forKey: Keys.selectedTone) {
            defaults.set(value, forKey: Keys.selectedTone)
        }
        if let value = UserDefaults.standard.string(forKey: Keys.outputLength) {
            defaults.set(value, forKey: Keys.outputLength)
        }
        if let value = UserDefaults.standard.string(forKey: Keys.customInstructions) {
            defaults.set(value, forKey: Keys.customInstructions)
        }

        // Mark as migrated
        defaults.set(true, forKey: Keys.settingsMigrated)
        #if DEBUG
        print("[Settings] Migration complete")
        #endif
    }

    // MARK: - Load Preferences (from App Group)

    private func loadPreferences() {
        guard let defaults = appGroupDefaults else {
            #if DEBUG
            print("[Settings] Warning: App Group UserDefaults not available, using defaults")
            #endif
            return
        }

        deepThinkEnabled = defaults.bool(forKey: Keys.deepThinkEnabled)
        unchainedEnabled = defaults.bool(forKey: Keys.unchainedEnabled)

        let savedTemp = defaults.double(forKey: Keys.temperature)
        if savedTemp > 0 { temperature = savedTemp }

        let savedTokens = defaults.integer(forKey: Keys.maxTokens)
        if savedTokens > 0 { maxTokens = savedTokens }

        // Load appearance preference
        if let appearanceRaw = defaults.string(forKey: Keys.appearanceMode),
           let mode = AppearanceMode(rawValue: appearanceRaw) {
            appearanceMode = mode
        }

        // Load tone preference
        if let toneRaw = defaults.string(forKey: Keys.selectedTone),
           let tone = ToneType(rawValue: toneRaw) {
            selectedTone = tone
        }

        // Load length preference
        if let lengthRaw = defaults.string(forKey: Keys.outputLength),
           let length = OutputLength(rawValue: lengthRaw) {
            outputLength = length
        }

        // Load custom instructions
        if let instructions = defaults.string(forKey: Keys.customInstructions) {
            customInstructions = instructions
        }

        #if DEBUG
        print("[Settings] Loaded preferences from App Group")
        #endif
    }

    // MARK: - Save Preferences (to App Group)

    func savePreferences() {
        guard let defaults = appGroupDefaults else {
            #if DEBUG
            print("[Settings] Warning: App Group UserDefaults not available")
            #endif
            return
        }

        defaults.set(deepThinkEnabled, forKey: Keys.deepThinkEnabled)
        defaults.set(unchainedEnabled, forKey: Keys.unchainedEnabled)
        defaults.set(temperature, forKey: Keys.temperature)
        defaults.set(maxTokens, forKey: Keys.maxTokens)
        defaults.set(appearanceMode.rawValue, forKey: Keys.appearanceMode)
        defaults.set(selectedTone.rawValue, forKey: Keys.selectedTone)
        defaults.set(outputLength.rawValue, forKey: Keys.outputLength)
        defaults.set(customInstructions, forKey: Keys.customInstructions)

        #if DEBUG
        print("[Settings] Saved preferences to App Group")
        #endif
    }
}

// MARK: - Model Enum

enum DeepseekModel: String, CaseIterable, Identifiable, Sendable {
    case reasoner = "deepseek-reasoner"
    case chat = "deepseek-chat"

    nonisolated var id: String { rawValue }

    var displayName: String {
        switch self {
        case .reasoner: return "Advanced Reasoner"
        case .chat: return "Fast Mode"
        }
    }

    var description: String {
        switch self {
        case .reasoner: return "Most advanced - 128K context, deep reasoning"
        case .chat: return "Fast & efficient - 128K context, standard mode"
        }
    }

    var maxOutputTokens: Int {
        switch self {
        case .reasoner: return 65536  // 64K max output
        case .chat: return 8192       // 8K max output
        }
    }
}
