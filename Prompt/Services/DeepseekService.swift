//
//  DeepseekService.swift
//  Prompt
//
//  Handles prompt enhancement via backend API
//

import Foundation

actor DeepseekService {
    // MARK: - Request/Response Models

    struct EnhanceRequest: Encodable, Sendable {
        let prompt: String
        let model: String?
        let temperature: Double?
        let maxTokens: Int?

        enum CodingKeys: String, CodingKey {
            case prompt
            case model
            case temperature
            case maxTokens
        }
    }

    struct EnhanceResponse: Decodable, Sendable {
        let enhancedPrompt: String
        let prompt: SavedPrompt?
        let usage: UsageDetails?
        let subscription: SubscriptionDetails?

        struct SavedPrompt: Decodable, Sendable {
            let id: String
            let originalPrompt: String
            let enhancedPrompt: String
            let model: String
            let totalTokens: Int
            let createdAt: String
        }

        struct UsageDetails: Decodable, Sendable {
            let inputTokens: Int
            let outputTokens: Int
            let totalTokens: Int
            let processingMs: Int
        }

        struct SubscriptionDetails: Decodable, Sendable {
            let tier: String
            let promptQuality: String
            let dailyPromptsUsed: Int
            let dailyPromptsLimit: Int
        }
    }

    // MARK: - Main Enhancement Function

    func enhancePrompt(
        userPrompt: String,
        model: DeepseekModel,
        temperature: Double,
        maxTokens: Int
    ) async throws -> EnhancedPromptResult {
        let request = EnhanceRequest(
            prompt: userPrompt,
            model: model.rawValue,
            temperature: temperature,
            maxTokens: maxTokens
        )

        let response: EnhanceResponse = try await APIClient.shared.request(
            "/prompts/enhance",
            method: .post,
            body: request
        )

        return EnhancedPromptResult(
            enhancedPrompt: response.enhancedPrompt,
            tokensUsed: response.usage?.totalTokens ?? 0,
            subscription: response.subscription.map { sub in
                EnhancedPromptResult.SubscriptionInfo(
                    tier: sub.tier,
                    promptQuality: sub.promptQuality,
                    dailyPromptsUsed: sub.dailyPromptsUsed,
                    dailyPromptsLimit: sub.dailyPromptsLimit
                )
            }
        )
    }
}

// MARK: - Result & Error Types

struct EnhancedPromptResult: Sendable {
    let enhancedPrompt: String
    let tokensUsed: Int
    let subscription: SubscriptionInfo?

    init(enhancedPrompt: String, tokensUsed: Int, subscription: SubscriptionInfo? = nil) {
        self.enhancedPrompt = enhancedPrompt
        self.tokensUsed = tokensUsed
        self.subscription = subscription
    }

    struct SubscriptionInfo: Sendable {
        let tier: String
        let promptQuality: String
        let dailyPromptsUsed: Int
        let dailyPromptsLimit: Int
    }
}

enum EnhancerError: LocalizedError, Sendable {
    case invalidResponse
    case httpError(Int)
    case apiError(String)
    case emptyResponse
    case notAuthenticated

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .apiError(let message):
            return "API error: \(message)"
        case .emptyResponse:
            return "Empty response from API"
        case .notAuthenticated:
            return "Please sign in to enhance prompts"
        }
    }
}
