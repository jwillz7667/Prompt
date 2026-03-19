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
    @Published private(set) var pendingJobCount = 0

    private let apiClient = APIClient.shared
    private let backgroundTaskManager = BackgroundTaskManager.shared
    private let pendingJobsKey = "pending_variation_generations_v2"

    private var comparisonCache: [String: VariationComparison] = [:]
    private var pollingTasks: [String: Task<Void, Never>] = [:]
    private var hasBootstrapped = false

    private struct PendingVariationGeneration: Codable, Identifiable {
        let id: String
        let prompt: String
        let createdAt: Date
    }

    struct VariationServiceFailure: LocalizedError {
        let message: String

        var errorDescription: String? {
            message
        }
    }

    private init() {}

    // MARK: - Lifecycle

    func bootstrap() async {
        guard !hasBootstrapped else {
            updatePendingJobCount()
            return
        }

        hasBootstrapped = true
        updatePendingJobCount()
        await resumePersistedPendingGenerations()
    }

    func appDidBecomeActive() async {
        await resumePersistedPendingGenerations()
    }

    // MARK: - Generation

    /// Create a variation generation job and keep tracking it independently of the current screen.
    func generateVariations(prompt: String, strategy: VariationStrategy = .quick) async throws -> VariationComparison {
        await bootstrap()

        isLoading = true
        error = nil

        do {
            let request = GenerateVariationsRequest(prompt: prompt, strategy: strategy)
            let backgroundTaskId = backgroundTaskManager.beginTask(named: "VariationGenerationStart")
            defer {
                backgroundTaskManager.endTask(backgroundTaskId)
            }

            let response: VariationResponse = try await apiClient.request(
                "/variations/generate",
                method: .post,
                body: request,
                timeoutInterval: 30
            )

            guard let comparison = response.data else {
                throw URLError(.badServerResponse)
            }

            storeComparison(comparison)
            currentComparison = comparison

            if comparison.isPending {
                persistPendingGeneration(id: comparison.variationId, prompt: comparison.originalPrompt)
                startPolling(variationId: comparison.variationId, initialDelay: 2)
            } else {
                removePendingGeneration(id: comparison.variationId)
                if comparison.status == .failed, let message = comparison.errorMessage {
                    error = VariationServiceFailure(message: message)
                }
            }

            isLoading = false
            return comparison
        } catch {
            self.error = error
            isLoading = false
            throw error
        }
    }

    // MARK: - Retrieval

    /// Get a variation batch by ID.
    func getVariation(id: String) async throws -> VariationComparison {
        try await fetchVariation(id: id, updateErrorState: true)
    }

    /// Re-attach to a pending generation for the given prompt after navigation or app relaunch.
    func resumePendingGenerationIfNeeded(for prompt: String) async -> VariationComparison? {
        await bootstrap()

        if let cached = latestComparison(matchingPrompt: prompt) {
            currentComparison = cached
            if cached.isPending {
                persistPendingGeneration(id: cached.variationId, prompt: cached.originalPrompt)
                startPolling(variationId: cached.variationId, initialDelay: 1)
            }
            return cached
        }

        guard let pending = loadPendingGenerations()
            .sorted(by: { $0.createdAt > $1.createdAt })
            .first(where: { $0.prompt == prompt }) else {
            return nil
        }

        do {
            let comparison = try await fetchVariation(id: pending.id, updateErrorState: false)
            currentComparison = comparison
            if comparison.isPending {
                startPolling(variationId: comparison.variationId, initialDelay: 1)
            }
            return comparison
        } catch {
            return nil
        }
    }

    func comparison(for id: String) -> VariationComparison? {
        comparisonCache[id]
    }

    func latestComparison(matchingPrompt prompt: String) -> VariationComparison? {
        comparisonCache.values
            .filter { $0.originalPrompt == prompt }
            .sorted { $0.updatedAt > $1.updatedAt }
            .first
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

        if let comparison = comparisonCache[variationId] {
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

            let updated = VariationComparison(
                variationId: comparison.variationId,
                originalPrompt: comparison.originalPrompt,
                status: comparison.status,
                results: updatedResults,
                winner: comparison.winner,
                errorMessage: comparison.errorMessage,
                createdAt: comparison.createdAt,
                updatedAt: comparison.updatedAt,
                metrics: comparison.metrics
            )

            storeComparison(updated)
            currentComparison = updated
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

        if let comparison = comparisonCache[variationId] {
            let updated = VariationComparison(
                variationId: comparison.variationId,
                originalPrompt: comparison.originalPrompt,
                status: comparison.status,
                results: comparison.results,
                winner: winnerIndex,
                errorMessage: comparison.errorMessage,
                createdAt: comparison.createdAt,
                updatedAt: comparison.updatedAt,
                metrics: comparison.metrics
            )

            storeComparison(updated)
            currentComparison = updated
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
        comparisonCache = comparisonCache.filter { $0.value.isPending }
    }

    private func fetchVariation(id: String, updateErrorState: Bool) async throws -> VariationComparison {
        let response: VariationResponse = try await apiClient.request(
            "/variations/\(id)",
            method: .get,
            timeoutInterval: 30
        )

        guard let comparison = response.data else {
            throw URLError(.badServerResponse)
        }

        storeComparison(comparison)
        currentComparison = comparison

        if comparison.isPending {
            persistPendingGeneration(id: comparison.variationId, prompt: comparison.originalPrompt)
        } else {
            stopPolling(variationId: comparison.variationId)
            removePendingGeneration(id: comparison.variationId)

            if comparison.status == .failed,
               updateErrorState,
               let message = comparison.errorMessage {
                error = VariationServiceFailure(message: message)
            }
        }

        return comparison
    }

    private func storeComparison(_ comparison: VariationComparison) {
        comparisonCache[comparison.variationId] = comparison
    }

    private func startPolling(variationId: String, initialDelay: TimeInterval) {
        guard pollingTasks[variationId] == nil else {
            return
        }

        pollingTasks[variationId] = Task { @MainActor [weak self] in
            guard let self else { return }

            var delay = max(initialDelay, 1)

            while !Task.isCancelled {
                if delay > 0 {
                    try? await Task.sleep(for: .seconds(delay))
                }

                do {
                    let comparison = try await self.fetchVariation(id: variationId, updateErrorState: false)

                    if comparison.isPending {
                        delay = 3
                        continue
                    }

                    if comparison.status == .failed, let message = comparison.errorMessage {
                        self.error = VariationServiceFailure(message: message)
                    }

                    self.pollingTasks[variationId] = nil
                    return
                } catch {
                    if Task.isCancelled {
                        self.pollingTasks[variationId] = nil
                        return
                    }

                    // The job is already persisted server-side. Treat polling failures as transient
                    // and retry instead of surfacing a false terminal generation error.
                    delay = min(delay * 2, 15)
                }
            }

            self.pollingTasks[variationId] = nil
        }
    }

    private func stopPolling(variationId: String) {
        pollingTasks[variationId]?.cancel()
        pollingTasks[variationId] = nil
    }

    private func resumePersistedPendingGenerations() async {
        guard await apiClient.isAuthenticated else {
            return
        }

        let pendingGenerations = loadPendingGenerations()
            .sorted(by: { $0.createdAt > $1.createdAt })

        guard !pendingGenerations.isEmpty else {
            updatePendingJobCount()
            return
        }

        if let newest = pendingGenerations.first, comparisonCache[newest.id] == nil {
            _ = try? await fetchVariation(id: newest.id, updateErrorState: false)
        }

        for pending in pendingGenerations {
            startPolling(variationId: pending.id, initialDelay: 1)
        }
    }

    private func loadPendingGenerations() -> [PendingVariationGeneration] {
        guard let data = UserDefaults.standard.data(forKey: pendingJobsKey) else {
            return []
        }

        do {
            return try JSONDecoder().decode([PendingVariationGeneration].self, from: data)
        } catch {
            return []
        }
    }

    private func savePendingGenerations(_ generations: [PendingVariationGeneration]) {
        do {
            let data = try JSONEncoder().encode(generations)
            UserDefaults.standard.set(data, forKey: pendingJobsKey)
        } catch {
            UserDefaults.standard.removeObject(forKey: pendingJobsKey)
        }

        updatePendingJobCount()
    }

    private func persistPendingGeneration(id: String, prompt: String) {
        var pending = loadPendingGenerations()

        if let existingIndex = pending.firstIndex(where: { $0.id == id }) {
            pending[existingIndex] = PendingVariationGeneration(
                id: id,
                prompt: prompt,
                createdAt: pending[existingIndex].createdAt
            )
        } else {
            pending.append(PendingVariationGeneration(id: id, prompt: prompt, createdAt: Date()))
        }

        savePendingGenerations(pending)
    }

    private func removePendingGeneration(id: String) {
        let pending = loadPendingGenerations().filter { $0.id != id }
        savePendingGenerations(pending)
    }

    private func updatePendingJobCount() {
        pendingJobCount = loadPendingGenerations().count
    }
}
