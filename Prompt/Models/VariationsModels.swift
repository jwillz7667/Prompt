import Foundation

// MARK: - Variation Strategy

enum VariationStrategy: String, CaseIterable, Identifiable, Sendable {
    case quick
    case comprehensive
    case modalityFocus = "modality_focus"
    case maxCompare = "max_compare"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .quick: return "Quick"
        case .comprehensive: return "Comprehensive"
        case .modalityFocus: return "Modality"
        case .maxCompare: return "MAX Compare"
        }
    }

    var icon: String {
        switch self {
        case .quick: return "bolt.fill"
        case .comprehensive: return "list.bullet.rectangle"
        case .modalityFocus: return "square.stack.3d.up.fill"
        case .maxCompare: return "flame.fill"
        }
    }

    var description: String {
        switch self {
        case .quick: return "4 variations, fast"
        case .comprehensive: return "Deeper comparison set"
        case .modalityFocus: return "Modality-tuned options"
        case .maxCompare: return "All-in MAX variants"
        }
    }
}

// MARK: - Variation Models

enum VariationGenerationStatus: String, Codable, Sendable {
    case queued
    case processing
    case completed
    case failed
    case unknown

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)
        self = VariationGenerationStatus(rawValue: rawValue) ?? .unknown
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var isPending: Bool {
        self == .queued || self == .processing
    }
}

struct VariationComparison: Codable, Sendable {
    let variationId: String
    let originalPrompt: String
    let status: VariationGenerationStatus
    let results: [VariationResultItem]
    let winner: Int?
    let errorMessage: String?
    let createdAt: Date
    let updatedAt: Date
    let metrics: VariationMetrics

    var isPending: Bool {
        status.isPending
    }
}

struct VariationResultItem: Codable, Identifiable, Sendable {
    let index: Int
    let label: String
    let mode: String
    let focus: String?
    let enhancedPrompt: String
    let tokensUsed: Int
    let score: Double?

    var id: Int { index }
}

struct VariationMetrics: Codable, Sendable {
    let averageTokens: Double
    let tokenRange: TokenRange
    let lengthRange: LengthRange
    let diversityScore: Double

    struct TokenRange: Codable, Sendable {
        let min: Int
        let max: Int
    }

    struct LengthRange: Codable, Sendable {
        let min: Int
        let max: Int
    }
}

// MARK: - Request Models

struct GenerateVariationsRequest: Codable, Sendable {
    let prompt: String
    let strategy: String?

    init(prompt: String, strategy: VariationStrategy) {
        self.prompt = prompt
        self.strategy = strategy.rawValue
    }
}

// MARK: - Response Wrappers

struct VariationResponse: Codable, Sendable {
    let success: Bool
    let data: VariationComparison?
}

struct VariationsListItem: Codable, Identifiable, Sendable {
    let id: String
    let originalPrompt: String
    let status: VariationGenerationStatus
    let selectedVariationIndex: Int?
    let errorMessage: String?
    let createdAt: Date
    let updatedAt: Date
    let results: [VariationResultItem]?
}

struct VariationsListResponse: Codable, Sendable {
    let success: Bool
    let data: [VariationsListItem]
    let total: Int
    let hasMore: Bool
}
