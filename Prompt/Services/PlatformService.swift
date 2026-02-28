import Foundation
import Combine

/// Service for platform validation, optimization, and cost estimation
@MainActor
final class PlatformService: ObservableObject {
    static let shared = PlatformService()

    @Published private(set) var platforms: [PlatformCapabilities] = []
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?

    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - Platform Info

    /// Load all available platforms with capabilities
    func loadPlatforms() async throws -> [PlatformCapabilities] {
        isLoading = true
        error = nil

        do {
            let response: PlatformsListResponse = try await apiClient.request(
                "/platforms",
                method: .get
            )
            self.platforms = response.platforms
            isLoading = false
            return response.platforms
        } catch {
            self.error = error
            isLoading = false
            throw error
        }
    }

    // MARK: - Validation

    /// Validate a prompt for a specific platform
    func validatePrompt(prompt: String, platform: PlatformType) async throws -> PlatformValidation {
        struct ValidateRequest: Codable {
            let prompt: String
            let platform: String
        }

        struct ValidateResponse: Codable {
            let platform: String
            let validation: PlatformValidation
            let promptLength: Int
            let estimatedTokens: Int
        }

        let request = ValidateRequest(prompt: prompt, platform: platform.rawValue)
        let response: ValidateResponse = try await apiClient.request(
            "/platforms/validate",
            method: .post,
            body: request
        )
        return response.validation
    }

    // MARK: - Optimization

    /// Optimize a prompt for a specific platform
    func optimizePrompt(prompt: String, platform: PlatformType) async throws -> PlatformOptimizationResult {
        struct OptimizeRequest: Codable {
            let prompt: String
            let platform: String
        }

        let request = OptimizeRequest(prompt: prompt, platform: platform.rawValue)
        let result: PlatformOptimizationResult = try await apiClient.request(
            "/platforms/optimize",
            method: .post,
            body: request
        )
        return result
    }

    // MARK: - Cost Estimation

    /// Estimate cost across multiple platforms
    func estimateCost(prompt: String, platforms: [PlatformType]) async throws -> CostEstimateResponse {
        struct CostRequest: Codable {
            let prompt: String
            let platforms: [String]
        }

        let request = CostRequest(
            prompt: prompt,
            platforms: platforms.map { $0.rawValue }
        )
        let response: CostEstimateResponse = try await apiClient.request(
            "/platforms/estimate-cost",
            method: .post,
            body: request
        )
        return response
    }

    // MARK: - Batch Optimization

    /// Optimize prompt for multiple platforms at once
    func batchOptimize(prompt: String, platforms: [PlatformType]) async throws -> BatchOptimizeResult {
        struct BatchRequest: Codable {
            let prompt: String
            let platforms: [String]
        }

        let request = BatchRequest(
            prompt: prompt,
            platforms: platforms.map { $0.rawValue }
        )
        let result: BatchOptimizeResult = try await apiClient.request(
            "/platforms/batch-optimize",
            method: .post,
            body: request
        )
        return result
    }

    // MARK: - Helpers

    func loadPlatformsIfNeeded() async {
        guard platforms.isEmpty, !isLoading else { return }
        do {
            _ = try await loadPlatforms()
        } catch {
            print("Failed to load platforms: \(error)")
        }
    }
}
