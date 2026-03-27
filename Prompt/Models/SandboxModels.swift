import Foundation

// MARK: - Platform Types

enum PlatformType: String, Codable, CaseIterable, Identifiable {
    case chatGPT = "CHATGPT"
    case claude = "CLAUDE"
    case gemini = "GEMINI"
    case perplexity = "PERPLEXITY"
    case midjourney = "MIDJOURNEY"
    case dalle = "DALLE"
    case stableDiffusion = "STABLE_DIFFUSION"
    case githubCopilot = "GITHUB_COPILOT"
    case sora = "SORA"
    case runway = "RUNWAY"
    case suno = "SUNO"
    case udio = "UDIO"
    case flux = "FLUX"
    case pika = "PIKA"
    case kling = "KLING"
    case musicgen = "MUSICGEN"
    case meshy = "MESHY"
    case tripo3d = "TRIPO3D"
    case custom = "CUSTOM"

    var id: String { rawValue }

    @MainActor
    static var storefrontAvailableCases: [PlatformType] {
        AppStoreComplianceManager.shared.visiblePlatforms()
    }

    @MainActor
    static var storefrontSelectableCases: [PlatformType] {
        storefrontAvailableCases.filter { $0 != .custom }
    }

    var displayName: String {
        switch self {
        case .chatGPT: return "AI Chat"
        case .claude: return "AI Assistant"
        case .gemini: return "AI Search"
        case .perplexity: return "AI Research"
        case .midjourney: return "Image Generator"
        case .dalle: return "Image Creator"
        case .stableDiffusion: return "Diffusion Model"
        case .githubCopilot: return "Code Assistant"
        case .sora: return "Video Generator"
        case .runway: return "Video Creator"
        case .suno: return "Music Generator"
        case .udio: return "Music Creator"
        case .flux: return "Image Studio"
        case .pika: return "Video Animator"
        case .kling: return "Video Studio"
        case .musicgen: return "Audio Generator"
        case .meshy: return "3D Generator"
        case .tripo3d: return "3D Creator"
        case .custom: return "Custom"
        }
    }

    var icon: String {
        switch self {
        case .chatGPT: return "message.circle.fill"
        case .claude: return "brain"
        case .gemini: return "sparkles"
        case .perplexity: return "magnifyingglass.circle.fill"
        case .midjourney: return "paintbrush.fill"
        case .dalle: return "paintpalette.fill"
        case .stableDiffusion: return "photo.artframe"
        case .githubCopilot: return "chevron.left.forwardslash.chevron.right"
        case .sora: return "film.stack"
        case .runway: return "video.fill"
        case .suno: return "music.note"
        case .udio: return "waveform"
        case .flux: return "wand.and.stars"
        case .pika: return "play.rectangle.fill"
        case .kling: return "film.fill"
        case .musicgen: return "music.quarternote.3"
        case .meshy: return "cube.fill"
        case .tripo3d: return "rotate.3d"
        case .custom: return "gear"
        }
    }

    var color: String {
        switch self {
        case .chatGPT: return "#10A37F"
        case .claude: return "#D97757"
        case .gemini: return "#4285F4"
        case .perplexity: return "#20B2AA"
        case .midjourney: return "#5865F2"
        case .dalle: return "#FF6B6B"
        case .stableDiffusion: return "#7C3AED"
        case .githubCopilot: return "#000000"
        case .sora: return "#FF4500"
        case .runway: return "#00D4AA"
        case .suno: return "#FF69B4"
        case .udio: return "#8B5CF6"
        case .flux: return "#FF8C00"
        case .pika: return "#00BFFF"
        case .kling: return "#E91E63"
        case .musicgen: return "#1DB954"
        case .meshy: return "#FF6F61"
        case .tripo3d: return "#9C27B0"
        case .custom: return "#6B7280"
        }
    }

    /// The modality this platform is associated with (nil = text/general)
    var associatedModality: ModalityType? {
        switch self {
        case .chatGPT, .claude, .gemini, .perplexity, .githubCopilot, .custom:
            return nil
        case .midjourney, .dalle, .stableDiffusion, .flux:
            return .image
        case .sora, .runway, .pika, .kling:
            return .video
        case .suno, .udio, .musicgen:
            return .music
        case .meshy, .tripo3d:
            return .threeD
        }
    }

    /// The backend targetPlatform key (lowercase, hyphenated)
    var backendPlatformKey: String {
        switch self {
        case .chatGPT: return "gpt"
        case .claude: return "claude"
        case .gemini: return "gemini"
        case .perplexity: return "gpt"
        case .githubCopilot: return "copilot"
        case .midjourney: return "midjourney"
        case .dalle: return "dalle"
        case .stableDiffusion: return "stable-diffusion"
        case .flux: return "flux"
        case .sora: return "sora"
        case .runway: return "runway"
        case .pika: return "pika"
        case .kling: return "kling"
        case .suno: return "suno"
        case .udio: return "udio"
        case .musicgen: return "musicgen"
        case .meshy: return "meshy"
        case .tripo3d: return "tripo3d"
        case .custom: return "general"
        }
    }

    /// Human-readable prompt limit description for the badge
    var promptLimitDescription: String? {
        switch self {
        case .midjourney: return "~150 words"
        case .dalle: return "~200 words"
        case .stableDiffusion: return "300+ words"
        case .flux: return "200-300 words"
        case .sora: return "250-350 words"
        case .runway: return "150-250 words"
        case .pika: return "~200 words"
        case .kling: return "~250 words"
        case .suno: return "300-500 chars"
        case .udio: return "~200 words"
        case .musicgen: return "30-80 words"
        case .meshy: return "~150 words"
        case .tripo3d: return "~150 words"
        default: return nil
        }
    }

    /// Recommended character length for prompts on this platform
    var recommendedCharacterLength: Int? {
        switch self {
        case .midjourney: return 750    // ~150 words
        case .dalle: return 1000        // ~200 words
        case .stableDiffusion: return 1500 // 300+ words
        case .flux: return 1250         // 200-300 words
        case .sora: return 1500         // 250-350 words
        case .runway: return 1000       // 150-250 words
        case .pika: return 1000         // ~200 words
        case .kling: return 1250        // ~250 words
        case .suno: return 500          // 300-500 chars
        case .udio: return 1000         // ~200 words
        case .musicgen: return 400      // 30-80 words
        case .meshy: return 750         // ~150 words
        case .tripo3d: return 750       // ~150 words
        default: return nil
        }
    }

    /// Whether selecting this platform should lock the modality selector
    var locksModality: Bool {
        return associatedModality != nil
    }
}

// MARK: - Sandbox Test Models

struct SandboxTest: Codable, Identifiable {
    let id: String
    let userId: String
    let promptId: String?
    let testPrompt: String
    let platforms: [PlatformType]
    let parameters: TestParameters?
    let status: String
    let scheduledFor: Date?
    let startedAt: Date?
    let completedAt: Date?
    let createdAt: Date
    let results: [PlatformTestResult]?
}

struct TestParameters: Codable {
    let temperature: Double?
    let maxTokens: Int?
    let topP: Double?
    let frequencyPenalty: Double?
    let presencePenalty: Double?
    let systemPrompt: String?
}

struct PlatformTestResult: Codable, Identifiable {
    let id: String
    let testId: String
    let platform: PlatformType
    let response: String?
    let error: String?
    let latencyMs: Int?
    let tokenCount: Int?
    let cost: Double?
    let metadata: [String: Any]?
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id, testId, platform, response, error, latencyMs, tokenCount, cost, metadata, createdAt
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        testId = try container.decode(String.self, forKey: .testId)
        platform = try container.decode(PlatformType.self, forKey: .platform)
        response = try container.decodeIfPresent(String.self, forKey: .response)
        error = try container.decodeIfPresent(String.self, forKey: .error)
        latencyMs = try container.decodeIfPresent(Int.self, forKey: .latencyMs)
        tokenCount = try container.decodeIfPresent(Int.self, forKey: .tokenCount)
        cost = try container.decodeIfPresent(Double.self, forKey: .cost)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        
        if let metadataJSON = try? container.decode([String: AnyDecodable].self, forKey: .metadata) {
            metadata = metadataJSON.mapValues { $0.value }
        } else {
            metadata = nil
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(testId, forKey: .testId)
        try container.encode(platform, forKey: .platform)
        try container.encodeIfPresent(response, forKey: .response)
        try container.encodeIfPresent(error, forKey: .error)
        try container.encodeIfPresent(latencyMs, forKey: .latencyMs)
        try container.encodeIfPresent(tokenCount, forKey: .tokenCount)
        try container.encodeIfPresent(cost, forKey: .cost)
        try container.encode(createdAt, forKey: .createdAt)
        
        if let metadata = metadata {
            let encodableMetadata = metadata.mapValues { AnyEncodable($0) }
            try container.encode(encodableMetadata, forKey: .metadata)
        }
    }
}

// MARK: - Test Comparison

struct TestComparison: Codable {
    let test: TestSummary
    let statistics: TestStatistics
    
    struct TestSummary: Codable {
        let id: String
        let prompt: String
        let platforms: [PlatformType]
        let status: String
        let createdAt: Date
        let completedAt: Date?
    }
    
    struct TestStatistics: Codable {
        let fastestPlatform: String?
        let slowestPlatform: String?
        let cheapestPlatform: String?
        let mostExpensivePlatform: String?
        let averageLatency: Int
        let averageCost: Double
        let successRate: Double
        let platformComparison: [PlatformComparisonItem]
    }
    
    struct PlatformComparisonItem: Codable, Identifiable {
        let platform: PlatformType
        let success: Bool
        let latencyMs: Int
        let cost: Double?
        let responseLength: Int
        let error: String?
        
        var id: String { platform.rawValue }
    }
}

// MARK: - Available Platform

struct AvailablePlatform: Codable, Identifiable {
    let platform: PlatformType
    let name: String
    let models: [String]
    let simulated: Bool?
    
    var id: String { platform.rawValue }
}

// MARK: - Request Models

struct CreateSandboxTestRequest: Codable {
    let promptId: String?
    let testPrompt: String
    let platforms: [PlatformType]
    let parameters: TestParameters?
    let scheduledFor: Date?
}

struct BatchTestRequest: Codable {
    let prompts: [String]
    let platforms: [PlatformType]
    let parameters: TestParameters?
}
