import Foundation

// MARK: - Platform Capabilities

struct PlatformCapabilities: Codable, Identifiable {
    let platform: String
    let name: String
    let category: String
    let maxTokens: Int
    let supportedModalities: [String]
    let features: [String]
    let costPerToken: Double?

    var id: String { platform }
}

// MARK: - Platform Validation

struct PlatformValidation: Codable {
    let isValid: Bool
    let errors: [ValidationIssue]
    let warnings: [ValidationIssue]
    let suggestions: [String]?
}

struct ValidationIssue: Codable, Identifiable {
    let type: String
    let message: String
    let severity: String?

    var id: String { "\(type)-\(message)" }
}

// MARK: - Platform Optimization

struct PlatformOptimizationResult: Codable {
    let originalPrompt: String
    let optimizedPrompt: String
    let platform: String
    let validation: PlatformValidation
    let cost: CostEstimate
    let improvements: OptimizationImprovements
}

struct OptimizationImprovements: Codable {
    let lengthReduction: Int
    let validationIssuesResolved: Int
}

// MARK: - Cost Estimation

struct CostEstimate: Codable {
    let estimatedCost: Double
    let estimatedTokens: Int
    let currency: String?
    let model: String?
}

struct CostEstimateResponse: Codable {
    let prompt: String
    let promptLength: Int
    let estimates: [PlatformCostEstimate]
    let cheapest: PlatformCostEstimate?
    let mostExpensive: PlatformCostEstimate?
}

struct PlatformCostEstimate: Codable, Identifiable {
    let platform: String
    let estimatedCost: Double
    let estimatedTokens: Int
    let currency: String?
    let model: String?
    let isValid: Bool?
    let warnings: Int?
    let errors: Int?

    var id: String { platform }
}

// MARK: - Batch Optimize

struct BatchOptimizeResult: Codable {
    let originalPrompt: String
    let results: [BatchOptimizeItem]
    let summary: BatchOptimizeSummary
}

struct BatchOptimizeItem: Codable, Identifiable {
    let platform: String
    let optimizedPrompt: String
    let validation: PlatformValidation
    let cost: CostEstimate

    var id: String { platform }
}

struct BatchOptimizeSummary: Codable {
    let totalPlatforms: Int
    let validPlatforms: Int
    let averageCost: Double
}

// MARK: - Platforms List Response

struct PlatformsListResponse: Codable {
    let platforms: [PlatformCapabilities]
    let count: Int
}
