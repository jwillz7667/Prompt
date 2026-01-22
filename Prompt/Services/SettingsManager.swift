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

@Observable
final class SettingsManager {
    var selectedModel: DeepseekModel = .reasoner
    var temperature: Double = 0.7
    var maxTokens: Int = 8192
    var appearanceMode: AppearanceMode = .system

    init() {
        loadPreferences()
    }

    // MARK: - User Defaults Preferences

    private func loadPreferences() {
        if let modelRaw = UserDefaults.standard.string(forKey: "selectedModel"),
           let model = DeepseekModel(rawValue: modelRaw) {
            selectedModel = model
        }
        let savedTemp = UserDefaults.standard.double(forKey: "temperature")
        if savedTemp > 0 { temperature = savedTemp }
        let savedTokens = UserDefaults.standard.integer(forKey: "maxTokens")
        if savedTokens > 0 { maxTokens = savedTokens }

        // Load appearance preference
        if let appearanceRaw = UserDefaults.standard.string(forKey: "appearanceMode"),
           let mode = AppearanceMode(rawValue: appearanceRaw) {
            appearanceMode = mode
        }
    }

    func savePreferences() {
        UserDefaults.standard.set(selectedModel.rawValue, forKey: "selectedModel")
        UserDefaults.standard.set(temperature, forKey: "temperature")
        UserDefaults.standard.set(maxTokens, forKey: "maxTokens")
        UserDefaults.standard.set(appearanceMode.rawValue, forKey: "appearanceMode")
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
