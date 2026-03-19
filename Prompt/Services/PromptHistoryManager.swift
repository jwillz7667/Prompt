//
//  PromptHistoryManager.swift
//  Prompt
//
//  Manages prompt history with offline-first cache support
//

import Foundation
import SwiftUI

@Observable
@MainActor
final class PromptHistoryManager {
    // MARK: - State

    var prompts: [PromptRecord] = []
    var isLoading = false
    var isSyncing = false
    var error: String?

    // Pagination
    var currentPage = 1
    var totalPages = 1
    var hasMorePages: Bool { currentPage < totalPages }

    // Filters
    var showFavoritesOnly = false
    var searchQuery = ""

    // MARK: - Dependencies

    private let dataManager = SwiftDataManager.shared
    private let syncManager = SyncManager.shared
    private let networkMonitor = NetworkMonitor.shared

    // MARK: - Singleton

    static let shared = PromptHistoryManager()
    private init() {
        // Load from cache immediately on init
        loadFromCache()
    }

    private func contentHash(for record: PromptRecord) -> String {
        let imageHash = record.imageAttachment?.dataUrl.prefix(64) ?? ""
        return "\(record.originalPrompt.prefix(100))|\(record.enhancedPrompt.prefix(100))|\(imageHash)"
    }

    // MARK: - Cache-First Loading

    /// Load prompts from local cache immediately
    private func loadFromCache() {
        let cached = dataManager.fetchPrompts(
            favoritesOnly: showFavoritesOnly,
            searchQuery: searchQuery
        )
        // Deduplicate by ID and content hash (keep first occurrence)
        var seenIds = Set<String>()
        var seenContentHashes = Set<String>()
        prompts = cached.compactMap { record -> PromptRecord? in
            let promptRecord = record.toPromptRecord()

            // Skip if we've seen this ID
            guard !seenIds.contains(promptRecord.id) else { return nil }

            // Create content hash to detect duplicate content with different IDs
            let contentHash = contentHash(for: promptRecord)
            guard !seenContentHashes.contains(contentHash) else { return nil }

            seenIds.insert(promptRecord.id)
            seenContentHashes.insert(contentHash)
            return promptRecord
        }
    }

    // MARK: - Fetch Prompts (Cache-First)

    func fetchPrompts(refresh: Bool = false) async {
        // On refresh or first load, show cache immediately
        if refresh || currentPage == 1 {
            loadFromCache()
        }

        // If offline, we're done - show cached data
        guard networkMonitor.isConnected else {
            isLoading = false
            return
        }

        guard await APIClient.shared.isAuthenticated else { return }

        if refresh {
            currentPage = 1
        }

        // Only show loading if cache is empty
        isLoading = prompts.isEmpty
        error = nil

        do {
            var endpoint = "/prompts?page=\(currentPage)&limit=20"

            if showFavoritesOnly {
                endpoint += "&favorite=true"
            }

            if !searchQuery.isEmpty {
                endpoint += "&search=\(searchQuery.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
            }

            let response: PromptsListResponse = try await APIClient.shared.request(endpoint)

            // Convert to PromptRecords and deduplicate
            let newRecords = response.prompts.map { PromptRecord(from: $0) }

            if refresh || currentPage == 1 {
                // Deduplicate by content hash
                var seenHashes = Set<String>()
                prompts = newRecords.filter { record in
                    let contentHash = contentHash(for: record)
                    guard !seenHashes.contains(contentHash) else { return false }
                    seenHashes.insert(contentHash)
                    return true
                }
            } else {
                // Append only records not already in the list (deduplicate by ID and content)
                let existingIds = Set(prompts.map { $0.id })
                let existingHashes = Set(prompts.map { contentHash(for: $0) })
                let uniqueNewRecords = newRecords.filter { record in
                    let contentHash = contentHash(for: record)
                    return !existingIds.contains(record.id) && !existingHashes.contains(contentHash)
                }
                prompts.append(contentsOf: uniqueNewRecords)
            }

            totalPages = response.pagination.totalPages

            // Update local cache with server data
            dataManager.upsertPrompts(newRecords)

        } catch {
            // On error, keep showing cached data
            if prompts.isEmpty {
                self.error = error.localizedDescription
            }
        }

        isLoading = false
    }

    func loadNextPage() async {
        guard hasMorePages && !isLoading else { return }
        currentPage += 1
        await fetchPrompts()
    }

    // MARK: - Save Prompt (with offline support)

    func savePrompt(
        original: String,
        enhanced: String,
        model: String,
        modality: String,
        imageAttachment: PromptImageAttachment?,
        temperature: Double,
        maxTokens: Int,
        inputTokens: Int,
        outputTokens: Int,
        totalTokens: Int,
        processingMs: Int
    ) async -> PromptRecord? {
        isSyncing = true
        defer { isSyncing = false }

        // Create local record first (optimistic)
        let localRecord = LocalPromptRecord(
            originalPrompt: original,
            enhancedPrompt: enhanced,
            model: model,
            modality: modality,
            imageAttachment: imageAttachment,
            totalTokens: totalTokens,
            isSynced: false,
            pendingAction: .create
        )
        dataManager.insertPrompt(localRecord)

        // Update UI immediately (avoid duplicates)
        let record = localRecord.toPromptRecord()
        if !prompts.contains(where: { $0.id == record.id }) {
            prompts.insert(record, at: 0)
        }

        // If offline, return the local record
        guard networkMonitor.isConnected else {
            syncManager.updatePendingCount()
            return record
        }

        // Try to sync to server
        guard await APIClient.shared.isAuthenticated else { return record }

        do {
            let normalizedTemperature = min(max(temperature, 0), 2)
            let normalizedMaxTokens = max(maxTokens, 1)

            let request = CreatePromptRequest(
                originalPrompt: original,
                enhancedPrompt: enhanced,
                model: model,
                modality: modality,
                imageAttachment: imageAttachment,
                temperature: normalizedTemperature,
                maxTokens: normalizedMaxTokens,
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                totalTokens: totalTokens,
                processingMs: processingMs
            )

            let response: CreatePromptResponse = try await APIClient.shared.request(
                "/prompts",
                method: .post,
                body: request
            )

            // Update local record with server ID
            let serverRecord = PromptRecord(from: response.prompt)
            dataManager.markAsSynced(id: localRecord.id, serverId: serverRecord.id)

            // Update UI with server record
            if let index = prompts.firstIndex(where: { $0.id == localRecord.id }) {
                prompts[index] = serverRecord
            }

            return serverRecord

        } catch {
            // Keep local record - will sync later
            self.error = error.localizedDescription
            return record
        }
    }

    // MARK: - Toggle Favorite (Optimistic with offline support)

    func toggleFavorite(_ prompt: PromptRecord) async {
        guard let index = prompts.firstIndex(where: { $0.id == prompt.id }) else { return }

        let newValue = !prompt.isFavorite

        // Optimistic update
        prompts[index].isFavorite = newValue

        // Queue for sync (handles offline case)
        syncManager.queueFavoriteToggle(promptId: prompt.id, newValue: newValue)
    }

    // MARK: - Delete Prompt (Optimistic with offline support)

    func deletePrompt(_ prompt: PromptRecord) async {
        guard let index = prompts.firstIndex(where: { $0.id == prompt.id }) else { return }

        // Optimistic update
        let removedPrompt = prompts.remove(at: index)

        // Queue for sync (handles offline case)
        syncManager.queueDelete(promptId: prompt.id)

        // If we're online, wait for sync to complete
        if networkMonitor.isConnected {
            do {
                try await APIClient.shared.requestVoid("/prompts/\(prompt.id)", method: .delete)
                dataManager.deletePrompt(id: prompt.id)
            } catch {
                // Revert on failure
                prompts.insert(removedPrompt, at: index)
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Clear Local Data

    func clearLocalData() {
        prompts = []
        currentPage = 1
        totalPages = 1
        syncManager.clearAllData()
    }

    // MARK: - Refresh Filters

    func applyFilters() async {
        currentPage = 1
        loadFromCache() // Instant filter on cache
        await fetchPrompts(refresh: true) // Then sync with server
    }
}

// MARK: - Models

struct PromptRecord: Identifiable, Codable {
    let id: String
    let originalPrompt: String
    let enhancedPrompt: String
    let model: String
    let modality: String
    let imageAttachment: PromptImageAttachment?
    let totalTokens: Int
    var title: String?
    var tags: [String]
    var isFavorite: Bool
    var isArchived: Bool
    let createdAt: Date

    init(from dto: PromptDTO) {
        self.id = dto.id
        self.originalPrompt = dto.originalPrompt
        self.enhancedPrompt = dto.enhancedPrompt
        self.model = dto.model
        self.modality = dto.modality
        self.imageAttachment = dto.imageAttachment
        self.totalTokens = dto.totalTokens
        self.title = dto.title
        self.tags = dto.tags
        self.isFavorite = dto.isFavorite
        self.isArchived = dto.isArchived
        self.createdAt = ISO8601DateFormatter().date(from: dto.createdAt) ?? Date()
    }
}

struct PromptDTO: Codable {
    let id: String
    let originalPrompt: String
    let enhancedPrompt: String
    let model: String
    let modality: String
    let imageAttachment: PromptImageAttachment?
    let totalTokens: Int
    let title: String?
    let tags: [String]
    let isFavorite: Bool
    let isArchived: Bool
    let createdAt: String
}

struct PromptsListResponse: Decodable {
    let prompts: [PromptDTO]
    let pagination: PaginationInfo
}

struct PaginationInfo: Decodable {
    let page: Int
    let limit: Int
    let total: Int
    let totalPages: Int
}

struct CreatePromptRequest: Encodable {
    let originalPrompt: String
    let enhancedPrompt: String
    let model: String
    let modality: String
    let imageAttachment: PromptImageAttachment?
    let temperature: Double
    let maxTokens: Int
    let inputTokens: Int
    let outputTokens: Int
    let totalTokens: Int
    let processingMs: Int
}

struct CreatePromptResponse: Decodable {
    let prompt: PromptDTO
}
