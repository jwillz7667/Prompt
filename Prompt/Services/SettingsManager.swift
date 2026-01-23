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
    var temperature: Double = 0.7
    var maxTokens: Int = 8192
    var appearanceMode: AppearanceMode = .system

    // Enhancement controls
    var selectedTone: ToneType = .professional
    var outputLength: OutputLength = .standard
    var customInstructions: String = ""

    // App Group for sharing with keyboard extension
    private let appGroupId = "group.com.res.promptomizer"
    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    init() {
        loadPreferences()
    }

    // MARK: - Computed Properties

    /// Returns the actual model to use based on Deep Think setting
    var effectiveModel: DeepseekModel {
        deepThinkEnabled ? .reasoner : .chat
    }

    // MARK: - User Defaults Preferences

    private func loadPreferences() {
        deepThinkEnabled = UserDefaults.standard.bool(forKey: "deepThinkEnabled")

        let savedTemp = UserDefaults.standard.double(forKey: "temperature")
        if savedTemp > 0 { temperature = savedTemp }
        let savedTokens = UserDefaults.standard.integer(forKey: "maxTokens")
        if savedTokens > 0 { maxTokens = savedTokens }

        // Load appearance preference
        if let appearanceRaw = UserDefaults.standard.string(forKey: "appearanceMode"),
           let mode = AppearanceMode(rawValue: appearanceRaw) {
            appearanceMode = mode
        }

        // Load tone preference
        if let toneRaw = UserDefaults.standard.string(forKey: "selectedTone"),
           let tone = ToneType(rawValue: toneRaw) {
            selectedTone = tone
        }

        // Load length preference
        if let lengthRaw = UserDefaults.standard.string(forKey: "outputLength"),
           let length = OutputLength(rawValue: lengthRaw) {
            outputLength = length
        }

        // Load custom instructions
        if let instructions = UserDefaults.standard.string(forKey: "customInstructions") {
            customInstructions = instructions
        }
    }

    func savePreferences() {
        UserDefaults.standard.set(deepThinkEnabled, forKey: "deepThinkEnabled")
        UserDefaults.standard.set(temperature, forKey: "temperature")
        UserDefaults.standard.set(maxTokens, forKey: "maxTokens")
        UserDefaults.standard.set(appearanceMode.rawValue, forKey: "appearanceMode")
        UserDefaults.standard.set(selectedTone.rawValue, forKey: "selectedTone")
        UserDefaults.standard.set(outputLength.rawValue, forKey: "outputLength")
        UserDefaults.standard.set(customInstructions, forKey: "customInstructions")

        // Sync to shared App Group for keyboard extension
        syncToSharedDefaults()
    }

    /// Syncs enhancement preferences to App Group for keyboard extension access
    private func syncToSharedDefaults() {
        sharedDefaults?.set(selectedTone.rawValue, forKey: "selectedTone")
        sharedDefaults?.set(outputLength.rawValue, forKey: "outputLength")
        sharedDefaults?.set(customInstructions, forKey: "customInstructions")
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
