import Foundation
import Combine

/// Service for generating and managing prompt variations
@MainActor
final class VariationsService: ObservableObject {
    static let shared = VariationsService()

    @Published private(set) var currentComparison: VariationComparison?
    @Published private(set) var variations: [VariationsListItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?

    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - Generation

    /// Generate variations for a prompt
    func generateVariations(prompt: String, strategy: VariationStrategy = .quick) async throws -> VariationComparison {
        isLoading = true
        error = nil

        do {
            let request = GenerateVariationsRequest(prompt: prompt, strategy: strategy)
            let response: VariationResponse = try await apiClient.request(
                "/variations/generate",
                method: .post,
                body: request,
                timeoutInterval: 180
            )

            guard let comparison = response.data else {
                throw URLError(.badServerResponse)
            }

            self.currentComparison = comparison
            isLoading = false
            return comparison
        } catch {
            self.error = error
            isLoading = false
            throw error
        }
    }

    // MARK: - Retrieval

    /// Get a variation batch by ID
    func getVariation(id: String) async throws -> VariationComparison {
        let response: VariationResponse = try await apiClient.request(
            "/variations/\(id)",
            method: .get,
            timeoutInterval: 60
        )

        guard let comparison = response.data else {
            throw URLError(.badServerResponse)
        }

        self.currentComparison = comparison
        return comparison
    }

    // MARK: - Rating & Selection

    /// Rate a specific variation
    func rateVariation(variationId: String, index: Int, rating: Int) async throws {
        struct RateRequest: Codable {
            let index: Int
            let rating: Int
        }

        let request = RateRequest(index: index, rating: rating)
        try await apiClient.requestVoid(
            "/variations/\(variationId)/rate",
            method: .post,
            body: request
        )

        // Update local comparison rating
        if let comparison = currentComparison, comparison.variationId == variationId {
            var updatedResults = comparison.results
            if let idx = updatedResults.firstIndex(where: { $0.index == index }) {
                let item = updatedResults[idx]
                updatedResults[idx] = VariationResultItem(
                    index: item.index,
                    label: item.label,
                    mode: item.mode,
                    focus: item.focus,
                    enhancedPrompt: item.enhancedPrompt,
                    tokensUsed: item.tokensUsed,
                    score: Double(rating) / 5.0
                )
            }
            self.currentComparison = VariationComparison(
                variationId: comparison.variationId,
                results: updatedResults,
                winner: comparison.winner,
                metrics: comparison.metrics
            )
        }
    }

    /// Select a winner from variations
    func selectWinner(variationId: String, winnerIndex: Int) async throws {
        struct SelectRequest: Codable {
            let winnerIndex: Int
        }

        let request = SelectRequest(winnerIndex: winnerIndex)
        try await apiClient.requestVoid(
            "/variations/\(variationId)/select",
            method: .post,
            body: request
        )

        // Update local winner
        if let comparison = currentComparison, comparison.variationId == variationId {
            self.currentComparison = VariationComparison(
                variationId: comparison.variationId,
                results: comparison.results,
                winner: winnerIndex,
                metrics: comparison.metrics
            )
        }
    }

    // MARK: - History

    /// Get user's variation batches
    func getUserVariations(limit: Int = 20, offset: Int = 0) async throws {
        isLoading = true
        error = nil

        do {
            let response: VariationsListResponse = try await apiClient.request(
                "/variations?limit=\(limit)&offset=\(offset)",
                method: .get,
                timeoutInterval: 60
            )
            self.variations = response.data
            isLoading = false
        } catch {
            self.error = error
            isLoading = false
            throw error
        }
    }

    // MARK: - Helpers

    func clearCache() {
        currentComparison = nil
        variations.removeAll()
    }
}
