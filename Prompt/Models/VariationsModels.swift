import Foundation

// MARK: - Variation Strategy

enum VariationStrategy: String, CaseIterable, Identifiable {
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

struct VariationComparison: Codable {
    let variationId: String
    let results: [VariationResultItem]
    let winner: Int?
    let metrics: VariationMetrics
}

struct VariationResultItem: Codable, Identifiable {
    let index: Int
    let label: String
    let mode: String
    let focus: String?
    let enhancedPrompt: String
    let tokensUsed: Int
    let score: Double?

    var id: Int { index }
}

struct VariationMetrics: Codable {
    let averageTokens: Double
    let tokenRange: TokenRange
    let lengthRange: LengthRange
    let diversityScore: Double

    struct TokenRange: Codable {
        let min: Int
        let max: Int
    }

    struct LengthRange: Codable {
        let min: Int
        let max: Int
    }
}

// MARK: - Request Models

struct GenerateVariationsRequest: Codable {
    let prompt: String
    let strategy: String?

    init(prompt: String, strategy: VariationStrategy) {
        self.prompt = prompt
        self.strategy = strategy.rawValue
    }
}

// MARK: - Response Wrappers

struct VariationResponse: Codable {
    let success: Bool
    let data: VariationComparison?
}

struct VariationsListItem: Codable, Identifiable {
    let id: String
    let originalPrompt: String
    let status: String
    let selectedVariationIndex: Int?
    let createdAt: Date
    let results: [VariationResultItem]?
}

struct VariationsListResponse: Codable {
    let success: Bool
    let data: [VariationsListItem]
    let total: Int
    let hasMore: Bool
}
