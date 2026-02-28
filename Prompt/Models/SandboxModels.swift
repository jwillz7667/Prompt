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
    case custom = "CUSTOM"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .chatGPT: return "ChatGPT"
        case .claude: return "Claude"
        case .gemini: return "Gemini"
        case .perplexity: return "Perplexity"
        case .midjourney: return "Midjourney"
        case .dalle: return "DALL-E"
        case .stableDiffusion: return "Stable Diffusion"
        case .githubCopilot: return "GitHub Copilot"
        case .sora: return "Sora"
        case .runway: return "Runway"
        case .suno: return "Suno"
        case .udio: return "Udio"
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
        case .custom: return "#6B7280"
        }
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