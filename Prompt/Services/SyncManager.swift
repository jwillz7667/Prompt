//
//  SyncManager.swift
//  Prompt
//
//  Manages offline sync queue and auto-sync when online
//

import Foundation
import SwiftUI
import Combine

/// Manages offline sync queue with automatic retry when online
@Observable
@MainActor
final class SyncManager {
    // MARK: - Singleton

    static let shared = SyncManager()

    // MARK: - State

    /// Number of pending changes
    var pendingCount: Int = 0

    /// Whether a sync is currently in progress
    var isSyncing: Bool = false

    /// Last sync error message
    var lastError: String?

    /// Last successful sync timestamp
    var lastSyncedAt: Date?

    // MARK: - Dependencies

    private let dataManager = SwiftDataManager.shared
    private let networkMonitor = NetworkMonitor.shared
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    private init() {
        setupNetworkObserver()
        updatePendingCount()
    }

    // MARK: - Network Observer

    private func setupNetworkObserver() {
        // Observe network changes and auto-sync when coming online
        networkMonitor.$isConnected
            .removeDuplicates()
            .sink { [weak self] isConnected in
                if isConnected {
                    Task { @MainActor in
                        await self?.syncPendingChanges()
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Pending Count

    func updatePendingCount() {
        pendingCount = dataManager.pendingCount
    }

    // MARK: - Queue Operations

    /// Queue a favorite toggle for sync
    func queueFavoriteToggle(promptId: String, newValue: Bool) {
        dataManager.toggleFavorite(id: promptId, newValue: newValue)
        updatePendingCount()

        // Try to sync immediately if online
        if networkMonitor.isConnected {
            Task {
                await syncPendingChanges()
            }
        }
    }

    /// Queue a delete for sync
    func queueDelete(promptId: String) {
        dataManager.markPromptForDeletion(id: promptId)
        updatePendingCount()

        // Try to sync immediately if online
        if networkMonitor.isConnected {
            Task {
                await syncPendingChanges()
            }
        }
    }

    // MARK: - Sync Operations

    /// Sync all pending changes to server
    func syncPendingChanges() async {
        guard networkMonitor.isConnected else {
            #if DEBUG
            print("[SyncManager] Offline - skipping sync")
            #endif
            return
        }

        guard !isSyncing else {
            #if DEBUG
            print("[SyncManager] Sync already in progress")
            #endif
            return
        }

        let pending = dataManager.fetchPendingPrompts()
        guard !pending.isEmpty else {
            pendingCount = 0
            return
        }

        isSyncing = true
        lastError = nil

        #if DEBUG
        print("[SyncManager] Syncing \(pending.count) pending changes")
        #endif

        for record in pending {
            guard let action = record.pendingAction else { continue }

            do {
                switch action {
                case .toggleFavorite:
                    try await syncFavoriteToggle(record)

                case .delete:
                    try await syncDelete(record)

                case .create:
                    try await syncCreate(record)

                case .update:
                    try await syncUpdate(record)
                }

                // Mark as synced on success
                dataManager.markAsSynced(id: record.id)

            } catch {
                #if DEBUG
                print("[SyncManager] Failed to sync \(record.id): \(error)")
                #endif
                lastError = error.localizedDescription
                // Continue with other items
            }
        }

        isSyncing = false
        lastSyncedAt = Date()
        updatePendingCount()
    }

    // MARK: - Individual Sync Operations

    private func syncFavoriteToggle(_ record: LocalPromptRecord) async throws {
        guard await APIClient.shared.isAuthenticated else {
            throw SyncError.notAuthenticated
        }

        try await APIClient.shared.requestVoid(
            "/prompts/\(record.id)",
            method: .patch,
            body: ["isFavorite": record.isFavorite]
        )
    }

    private func syncDelete(_ record: LocalPromptRecord) async throws {
        guard await APIClient.shared.isAuthenticated else {
            throw SyncError.notAuthenticated
        }

        try await APIClient.shared.requestVoid(
            "/prompts/\(record.id)",
            method: .delete
        )

        // Remove from local storage after successful server delete
        dataManager.deletePrompt(id: record.id)
    }

    private func syncCreate(_ record: LocalPromptRecord) async throws {
        guard await APIClient.shared.isAuthenticated else {
            throw SyncError.notAuthenticated
        }

        let request = CreatePromptRequest(
            originalPrompt: record.originalPrompt,
            enhancedPrompt: record.enhancedPrompt,
            model: record.model,
            temperature: 0.7,
            maxTokens: 4096,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: record.totalTokens,
            processingMs: 0
        )

        let response: CreatePromptResponse = try await APIClient.shared.request(
            "/prompts",
            method: .post,
            body: request
        )

        // Update local record with server-assigned ID
        dataManager.markAsSynced(id: record.id, serverId: response.prompt.id)
    }

    private func syncUpdate(_ record: LocalPromptRecord) async throws {
        guard await APIClient.shared.isAuthenticated else {
            throw SyncError.notAuthenticated
        }

        struct UpdateBody: Encodable {
            let title: String?
            let tags: [String]
            let isFavorite: Bool
            let isArchived: Bool
        }

        let body = UpdateBody(
            title: record.title,
            tags: record.tags,
            isFavorite: record.isFavorite,
            isArchived: record.isArchived
        )

        try await APIClient.shared.requestVoid(
            "/prompts/\(record.id)",
            method: .patch,
            body: body
        )
    }

    // MARK: - Clear

    /// Clear all local data and pending sync (for logout)
    func clearAllData() {
        dataManager.clearAllPrompts()
        dataManager.clearAllTemplates()
        pendingCount = 0
        lastError = nil
    }
}

// MARK: - Sync Errors

enum SyncError: LocalizedError {
    case notAuthenticated
    case networkUnavailable
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Please sign in to sync"
        case .networkUnavailable:
            return "No network connection"
        case .serverError(let message):
            return message
        }
    }
}
