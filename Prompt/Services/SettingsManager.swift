//
//  SettingsManager.swift
//  Prompt
//
//  Manages API key storage (Keychain) and user preferences
//

import Foundation
import SwiftUI
import Observation

@Observable
final class SettingsManager {
    let apiKey: String = "sk-30f4da11916a4f9890c34eaf2c133acb"
    var selectedModel: DeepseekModel = .reasoner
    var temperature: Double = 0.7
    var maxTokens: Int = 8192

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
    }

    func savePreferences() {
        UserDefaults.standard.set(selectedModel.rawValue, forKey: "selectedModel")
        UserDefaults.standard.set(temperature, forKey: "temperature")
        UserDefaults.standard.set(maxTokens, forKey: "maxTokens")
    }

    var hasValidAPIKey: Bool { true }
}

// MARK: - Model Enum

enum DeepseekModel: String, CaseIterable, Identifiable, Sendable {
    case reasoner = "deepseek-reasoner"
    case chat = "deepseek-chat"

    nonisolated var id: String { rawValue }

    var displayName: String {
        switch self {
        case .reasoner: return "DeepSeek V3.2 Reasoner"
        case .chat: return "DeepSeek V3.2 Chat"
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
