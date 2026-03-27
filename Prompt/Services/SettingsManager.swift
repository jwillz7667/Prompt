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

enum PromptGenerationMode: String, Codable, Sendable {
    case standard = "standard"
    case max = "max"
}

enum ThreadConversationMode: String, CaseIterable, Identifiable, Codable, Sendable {
    case optimize = "optimize"
    case chat = "chat"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .optimize: return "Optimize"
        case .chat: return "Chat"
        }
    }

    var icon: String {
        switch self {
        case .optimize: return "wand.and.stars"
        case .chat: return "bubble.left.and.bubble.right.fill"
        }
    }

    var shortDescription: String {
        switch self {
        case .optimize:
            return "Rewrite requests into stronger prompts"
        case .chat:
            return "Talk directly with the assistant"
        }
    }
}

// MARK: - Modality Type

enum ModalityType: String, CaseIterable, Identifiable, Codable, Sendable {
    case text = "text"
    case image = "image"
    case video = "video"
    case music = "music"
    case audio = "audio"
    case code = "code"
    case threeD = "3d"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .text: return "Text"
        case .image: return "Image"
        case .video: return "Video"
        case .music: return "Music"
        case .audio: return "Audio"
        case .code: return "Code"
        case .threeD: return "3D"
        }
    }

    var icon: String {
        switch self {
        case .text: return "text.bubble.fill"
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .music: return "music.note"
        case .audio: return "waveform"
        case .code: return "chevron.left.forwardslash.chevron.right"
        case .threeD: return "cube.fill"
        }
    }

    var description: String {
        switch self {
        case .text: return "AI text assistants"
        case .image: return "AI image generators"
        case .video: return "AI video generators"
        case .music: return "AI music generators"
        case .audio: return "Speech, SFX, Soundscapes"
        case .code: return "AI code assistants"
        case .threeD: return "AI 3D model generators"
        }
    }

    var accentColor: String {
        switch self {
        case .text: return "brandPurple"
        case .image: return "pink"
        case .video: return "red"
        case .music: return "orange"
        case .audio: return "teal"
        case .code: return "green"
        case .threeD: return "blue"
        }
    }

    /// The API modality value sent to the backend (music maps to audio)
    var apiModality: String {
        switch self {
        case .music: return "audio"
        default: return rawValue
        }
    }
}

// MARK: - Audio Sub-Modality

enum AudioSubModalityType: String, CaseIterable, Identifiable, Codable, Sendable {
    case speech = "speech"
    case soundscape = "soundscape"
    case voiceover = "voiceover"
    case lyrics = "lyrics"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .speech: return "Speech"
        case .soundscape: return "Soundscape"
        case .voiceover: return "Voiceover"
        case .lyrics: return "Lyrics"
        }
    }

    var icon: String {
        switch self {
        case .speech: return "waveform.and.person.filled"
        case .soundscape: return "leaf.fill"
        case .voiceover: return "mic.fill"
        case .lyrics: return "text.quote"
        }
    }

    var description: String {
        switch self {
        case .speech: return "Voice synthesis, narration"
        case .soundscape: return "Ambient, environmental"
        case .voiceover: return "Professional VO, podcasts"
        case .lyrics: return "Song lyrics for AI music"
        }
    }
}

@Observable
final class SettingsManager {
    var maxModeEnabled: Bool = false
    var nsfwModeEnabled: Bool = false
    var nsfwDisclaimerAccepted: Bool = false
    var temperature: Double = 0.7
    var maxTokens: Int = 8192
    var appearanceMode: AppearanceMode = .system

    // Enhancement controls
    var selectedModality: ModalityType = .text
    var selectedAudioSubModality: AudioSubModalityType = .speech
    var conversationMode: ThreadConversationMode = .optimize

    /// Returns the effective sub-modality string for the current modality, or nil if not applicable
    var effectiveSubModality: String? {
        switch selectedModality {
        case .music: return "music"
        case .audio: return selectedAudioSubModality.rawValue
        default: return nil
        }
    }

    var promptMode: PromptGenerationMode {
        maxModeEnabled ? .max : .standard
    }

    /// Returns "nsfw" when NSFW mode is enabled, otherwise the selected modality's API value
    var effectiveApiModality: String {
        nsfwModeEnabled ? "nsfw" : selectedModality.apiModality
    }

    // App Group for sharing with keyboard extension AND persistence across updates
    private let appGroupId = "group.com.res.promptomizer"
    private var appGroupDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // Keys for settings
    private enum Keys {
        static let maxModeEnabled = "maxModeEnabled"
        static let temperature = "temperature"
        static let maxTokens = "maxTokens"
        static let appearanceMode = "appearanceMode"
        static let selectedModality = "selectedModality"
        static let selectedAudioSubModality = "selectedAudioSubModality"
        static let conversationMode = "conversationMode"
        static let nsfwModeEnabled = "nsfwModeEnabled"
        static let nsfwDisclaimerAccepted = "nsfwDisclaimerAccepted"
        static let settingsMigrated = "settingsMigratedToAppGroup"
    }

    init() {
        migrateToAppGroupIfNeeded()
        loadPreferences()
    }

    // MARK: - Computed Properties

    /// MAX mode uses the reasoning model; standard mode uses the fast chat model.
    var effectiveModel: DeepseekModel {
        maxModeEnabled ? .reasoner : .chat
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
        if UserDefaults.standard.double(forKey: Keys.temperature) > 0 {
            defaults.set(UserDefaults.standard.double(forKey: Keys.temperature), forKey: Keys.temperature)
        }
        if UserDefaults.standard.integer(forKey: Keys.maxTokens) > 0 {
            defaults.set(UserDefaults.standard.integer(forKey: Keys.maxTokens), forKey: Keys.maxTokens)
        }
        if let value = UserDefaults.standard.string(forKey: Keys.appearanceMode) {
            defaults.set(value, forKey: Keys.appearanceMode)
        }
        if let value = UserDefaults.standard.string(forKey: Keys.conversationMode) {
            defaults.set(value, forKey: Keys.conversationMode)
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

        maxModeEnabled = defaults.bool(forKey: Keys.maxModeEnabled)
        nsfwModeEnabled = defaults.bool(forKey: Keys.nsfwModeEnabled)
        nsfwDisclaimerAccepted = defaults.bool(forKey: Keys.nsfwDisclaimerAccepted)

        let savedTemp = defaults.double(forKey: Keys.temperature)
        if savedTemp > 0 { temperature = savedTemp }

        let savedTokens = defaults.integer(forKey: Keys.maxTokens)
        if savedTokens > 0 { maxTokens = savedTokens }

        // Load appearance preference
        if let appearanceRaw = defaults.string(forKey: Keys.appearanceMode),
           let mode = AppearanceMode(rawValue: appearanceRaw) {
            appearanceMode = mode
        }

        // Load modality preference
        if let modalityRaw = defaults.string(forKey: Keys.selectedModality),
           let modality = ModalityType(rawValue: modalityRaw) {
            selectedModality = modality
        }

        if let conversationModeRaw = defaults.string(forKey: Keys.conversationMode),
           let mode = ThreadConversationMode(rawValue: conversationModeRaw) {
            conversationMode = mode
        }

        // Load audio sub-modality preference
        if let subModalityRaw = defaults.string(forKey: Keys.selectedAudioSubModality),
           let subModality = AudioSubModalityType(rawValue: subModalityRaw) {
            selectedAudioSubModality = subModality
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

        defaults.set(maxModeEnabled, forKey: Keys.maxModeEnabled)
        defaults.set(nsfwModeEnabled, forKey: Keys.nsfwModeEnabled)
        defaults.set(nsfwDisclaimerAccepted, forKey: Keys.nsfwDisclaimerAccepted)
        defaults.set(temperature, forKey: Keys.temperature)
        defaults.set(maxTokens, forKey: Keys.maxTokens)
        defaults.set(appearanceMode.rawValue, forKey: Keys.appearanceMode)
        defaults.set(selectedModality.rawValue, forKey: Keys.selectedModality)
        defaults.set(selectedAudioSubModality.rawValue, forKey: Keys.selectedAudioSubModality)
        defaults.set(conversationMode.rawValue, forKey: Keys.conversationMode)

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
        case .reasoner: return "MAX"
        case .chat: return "Standard"
        }
    }

    var description: String {
        switch self {
        case .reasoner: return "Best quality prompt generation with deeper planning, structure, and validation"
        case .chat: return "Fast, high-quality prompt generation for standard enhancement"
        }
    }

    var maxOutputTokens: Int {
        switch self {
        case .reasoner: return 65536  // 64K max output
        case .chat: return 8192       // 8K max output
        }
    }
}
