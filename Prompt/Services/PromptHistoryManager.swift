//
//  PromptHistoryManager.swift
//  Prompt
//
//  Manages prompt history synchronization with backend
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

    // MARK: - Singleton

    static let shared = PromptHistoryManager()
    private init() {}

    // MARK: - Fetch Prompts

    func fetchPrompts(refresh: Bool = false) async {
        guard await APIClient.shared.isAuthenticated else { return }

        if refresh {
            currentPage = 1
        }

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

            if refresh || currentPage == 1 {
                prompts = response.prompts.map { PromptRecord(from: $0) }
            } else {
                let newPrompts = response.prompts.map { PromptRecord(from: $0) }
                prompts.append(contentsOf: newPrompts)
            }

            totalPages = response.pagination.totalPages
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func loadNextPage() async {
        guard hasMorePages && !isLoading else { return }
        currentPage += 1
        await fetchPrompts()
    }

    // MARK: - Save Prompt

    func savePrompt(
        original: String,
        enhanced: String,
        model: String,
        temperature: Double,
        maxTokens: Int,
        inputTokens: Int,
        outputTokens: Int,
        totalTokens: Int,
        processingMs: Int
    ) async -> PromptRecord? {
        guard await APIClient.shared.isAuthenticated else { return nil }

        isSyncing = true
        defer { isSyncing = false }

        do {
            let request = CreatePromptRequest(
                originalPrompt: original,
                enhancedPrompt: enhanced,
                model: model,
                temperature: temperature,
                maxTokens: maxTokens,
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

            let record = PromptRecord(from: response.prompt)

            // Insert at beginning of list
            prompts.insert(record, at: 0)

            return record
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    // MARK: - Toggle Favorite

    func toggleFavorite(_ prompt: PromptRecord) async {
        guard let index = prompts.firstIndex(where: { $0.id == prompt.id }) else { return }

        let newValue = !prompt.isFavorite
        prompts[index].isFavorite = newValue

        do {
            try await APIClient.shared.requestVoid(
                "/prompts/\(prompt.id)",
                method: .patch,
                body: ["isFavorite": newValue]
            )
        } catch {
            // Revert on failure
            prompts[index].isFavorite = !newValue
            self.error = error.localizedDescription
        }
    }

    // MARK: - Delete Prompt

    func deletePrompt(_ prompt: PromptRecord) async {
        guard let index = prompts.firstIndex(where: { $0.id == prompt.id }) else { return }

        let removedPrompt = prompts.remove(at: index)

        do {
            try await APIClient.shared.requestVoid("/prompts/\(prompt.id)", method: .delete)
        } catch {
            // Revert on failure
            prompts.insert(removedPrompt, at: index)
            self.error = error.localizedDescription
        }
    }

    // MARK: - Clear Local Data

    func clearLocalData() {
        prompts = []
        currentPage = 1
        totalPages = 1
    }
}

// MARK: - Models

struct PromptRecord: Identifiable, Codable {
    let id: String
    let originalPrompt: String
    let enhancedPrompt: String
    let model: String
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
