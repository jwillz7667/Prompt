//
//  DeepseekService.swift
//  Prompt
//
//  Handles prompt enhancement via backend API
//

import Foundation

actor DeepseekService {
    nonisolated private static func makeSubscriptionInfo(
        from details: EnhanceResponse.SubscriptionDetails?
    ) -> EnhancedPromptResult.SubscriptionInfo? {
        guard let details else { return nil }

        return EnhancedPromptResult.SubscriptionInfo(
            tier: details.tier,
            promptQuality: details.promptQuality,
            dailyPromptsUsed: details.dailyPromptsUsed,
            dailyPromptsLimit: details.dailyPromptsLimit,
            maxModeUsedToday: details.maxModeUsedToday,
            maxModeDailyLimit: details.maxModeDailyLimit,
            maxModeRemaining: details.maxModeRemaining
        )
    }

    nonisolated private static func makeSubscriptionInfo(
        from details: StreamEvent.StreamSubscription?
    ) -> EnhancedPromptResult.SubscriptionInfo? {
        guard let details else { return nil }

        return EnhancedPromptResult.SubscriptionInfo(
            tier: details.tier,
            promptQuality: details.promptQuality,
            dailyPromptsUsed: details.dailyPromptsUsed,
            dailyPromptsLimit: details.dailyPromptsLimit,
            maxModeUsedToday: nil,
            maxModeDailyLimit: nil,
            maxModeRemaining: nil
        )
    }

    // MARK: - Request/Response Models

    struct EnhanceRequest: Encodable, Sendable {
        let prompt: String
        let model: String?
        let temperature: Double?
        let maxTokens: Int?
        let mode: String?
        let modality: String?
        let subModality: String?
        let customInstructions: String?
        let targetCharacterLength: Int?

        enum CodingKeys: String, CodingKey {
            case prompt
            case model
            case temperature
            case maxTokens
            case mode
            case modality
            case subModality
            case customInstructions
            case targetCharacterLength
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
            let maxModeUsedToday: Int?
            let maxModeDailyLimit: Int?
            let maxModeRemaining: Int?
        }
    }

    // MARK: - Main Enhancement Function

    func enhancePrompt(
        userPrompt: String,
        model: DeepseekModel,
        temperature: Double,
        maxTokens: Int,
        mode: PromptGenerationMode = .standard,
        modality: ModalityType? = nil,
        subModality: String? = nil,
        customInstructions: String? = nil,
        targetCharacterLength: Int? = nil
    ) async throws -> EnhancedPromptResult {
        let apiModality = await MainActor.run { modality?.apiModality }
        let request = EnhanceRequest(
            prompt: userPrompt,
            model: model.rawValue,
            temperature: temperature,
            maxTokens: maxTokens,
            mode: mode.rawValue,
            modality: apiModality,
            subModality: subModality,
            customInstructions: customInstructions?.isEmpty == false ? customInstructions : nil,
            targetCharacterLength: targetCharacterLength
        )

        let response: EnhanceResponse = try await APIClient.shared.request(
            "/prompts/enhance",
            method: .post,
            body: request
        )

        return await MainActor.run {
            EnhancedPromptResult(
                enhancedPrompt: response.enhancedPrompt,
                tokensUsed: response.usage?.totalTokens ?? 0,
                subscription: Self.makeSubscriptionInfo(from: response.subscription)
            )
        }
    }

    // MARK: - Streaming Enhancement Function

    func enhancePromptStream(
        userPrompt: String,
        model: DeepseekModel,
        temperature: Double,
        maxTokens: Int,
        mode: PromptGenerationMode = .standard,
        modality: ModalityType? = nil,
        subModality: String? = nil,
        customInstructions: String? = nil,
        targetCharacterLength: Int? = nil,
        onToken: @escaping @Sendable (String) -> Void
    ) async throws -> EnhancedPromptResult {
        let apiModality = await MainActor.run { modality?.apiModality }
        let request = EnhanceRequest(
            prompt: userPrompt,
            model: model.rawValue,
            temperature: temperature,
            maxTokens: maxTokens,
            mode: mode.rawValue,
            modality: apiModality,
            subModality: subModality,
            customInstructions: customInstructions?.isEmpty == false ? customInstructions : nil,
            targetCharacterLength: targetCharacterLength
        )

        let stream = await APIClient.shared.requestStream(
            "/prompts/enhance/stream",
            method: .post,
            body: request
        )

        var fullContent = ""
        var finalResult: EnhancedPromptResult?

        for try await event in stream {
            switch event.type {
            case .token:
                if let content = event.content {
                    fullContent += content
                    onToken(content)
                }
            case .complete:
                let completedContent = fullContent
                finalResult = await MainActor.run {
                    EnhancedPromptResult(
                        enhancedPrompt: completedContent,
                        tokensUsed: event.usage?.totalTokens ?? 0,
                        subscription: Self.makeSubscriptionInfo(from: event.subscription)
                    )
                }
            case .error:
                throw EnhancerError.apiError(event.message ?? "Unknown error")
            }
        }

        guard let result = finalResult else {
            throw EnhancerError.emptyResponse
        }

        return result
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
        let maxModeUsedToday: Int?
        let maxModeDailyLimit: Int?
        let maxModeRemaining: Int?
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
