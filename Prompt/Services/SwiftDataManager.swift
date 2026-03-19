//
//  SwiftDataManager.swift
//  Prompt
//
//  SwiftData persistence layer for offline support
//

import Foundation
import SwiftData
import SwiftUI

/// Manages SwiftData persistence for offline prompt storage
@MainActor
final class SwiftDataManager {
    // MARK: - Singleton

    static let shared = SwiftDataManager()

    // MARK: - Model Container

    private(set) var modelContainer: ModelContainer?

    /// Indicates whether the database is available for use
    var isAvailable: Bool {
        modelContainer != nil
    }

    private init() {
        // Configure for App Group to share with widget extension
        // Disable CloudKit sync - we use our own backend sync
        let schema = Schema([
            LocalPromptRecord.self,
        ])

        let primaryConfig = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true,
            groupContainer: .identifier("group.com.res.promptomizer"),
            cloudKitDatabase: .none  // Disable CloudKit - use local storage only
        )

        do {
            modelContainer = try ModelContainer(
                for: schema,
                configurations: [primaryConfig]
            )
        } catch {
            // Log error for analytics
            ErrorHandler.shared.handleSilently(
                AppError.dataCorrupted,
                context: "SwiftDataManager.init"
            )
            #if DEBUG
            print("[SwiftDataManager] Primary container failed: \(error)")
            #endif

            // Fallback to in-memory container (app still works, just no persistence)
            let fallbackConfig = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: true,
                allowsSave: true
            )

            do {
                modelContainer = try ModelContainer(for: schema, configurations: [fallbackConfig])
                #if DEBUG
                print("[SwiftDataManager] Using in-memory fallback container")
                #endif
            } catch {
                // Last resort - nil container, operations will gracefully fail
                modelContainer = nil
                #if DEBUG
                print("[SwiftDataManager] All container initialization failed: \(error)")
                #endif
            }
        }
    }

    // MARK: - Context

    var context: ModelContext? {
        modelContainer?.mainContext
    }

    // MARK: - Prompt Operations

    /// Fetch all prompts, optionally filtered
    func fetchPrompts(
        favoritesOnly: Bool = false,
        searchQuery: String = "",
        limit: Int? = nil
    ) -> [LocalPromptRecord] {
        var descriptor = FetchDescriptor<LocalPromptRecord>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )

        if let limit {
            descriptor.fetchLimit = limit
        }

        var predicates: [Predicate<LocalPromptRecord>] = []

        // Filter deleted items
        predicates.append(#Predicate { $0.pendingActionRaw != "delete" })

        if favoritesOnly {
            predicates.append(#Predicate { $0.isFavorite == true })
        }

        if !searchQuery.isEmpty {
            let query = searchQuery.lowercased()
            predicates.append(#Predicate {
                $0.originalPrompt.localizedStandardContains(query) ||
                $0.enhancedPrompt.localizedStandardContains(query)
            })
        }

        // Combine predicates
        if predicates.count > 1 {
            descriptor.predicate = #Predicate { record in
                record.pendingActionRaw != "delete"
            }
        } else if let first = predicates.first {
            descriptor.predicate = first
        }

        guard let context else {
            #if DEBUG
            print("[SwiftDataManager] Context unavailable for fetchPrompts")
            #endif
            return []
        }

        do {
            return try context.fetch(descriptor)
        } catch {
            #if DEBUG
            print("[SwiftDataManager] Failed to fetch prompts: \(error)")
            #endif
            return []
        }
    }

    /// Fetch prompts with pending actions (for sync)
    func fetchPendingPrompts() -> [LocalPromptRecord] {
        guard let context else {
            #if DEBUG
            print("[SwiftDataManager] Context unavailable for fetchPendingPrompts")
            #endif
            return []
        }

        let descriptor = FetchDescriptor<LocalPromptRecord>(
            predicate: #Predicate { $0.pendingActionRaw != nil },
            sortBy: [SortDescriptor(\.createdAt)]
        )

        do {
            return try context.fetch(descriptor)
        } catch {
            #if DEBUG
            print("[SwiftDataManager] Failed to fetch pending prompts: \(error)")
            #endif
            return []
        }
    }

    /// Count of pending prompts
    var pendingCount: Int {
        fetchPendingPrompts().count
    }

    /// Insert or update prompts from API response
    func upsertPrompts(_ records: [PromptRecord]) {
        guard let context else {
            #if DEBUG
            print("[SwiftDataManager] Context unavailable for upsertPrompts")
            #endif
            return
        }

        for record in records {
            let descriptor = FetchDescriptor<LocalPromptRecord>(
                predicate: #Predicate { $0.id == record.id }
            )

            do {
                let existing = try context.fetch(descriptor)
                if let local = existing.first {
                    // Update existing if no pending action
                    if local.pendingAction == nil {
                        local.originalPrompt = record.originalPrompt
                        local.enhancedPrompt = record.enhancedPrompt
                        local.model = record.model
                        local.totalTokens = record.totalTokens
                        local.title = record.title
                        local.tags = record.tags
                        local.isFavorite = record.isFavorite
                        local.isArchived = record.isArchived
                        local.isSynced = true
                        local.lastSyncedAt = Date()
                    }
                } else {
                    // Insert new
                    let local = LocalPromptRecord(from: record)
                    context.insert(local)
                }
            } catch {
                #if DEBUG
                print("[SwiftDataManager] Failed to upsert prompt \(record.id): \(error)")
                #endif
            }
        }

        saveContext()
    }

    /// Get a single prompt by ID
    func getPrompt(id: String) -> LocalPromptRecord? {
        guard let context else { return nil }

        let descriptor = FetchDescriptor<LocalPromptRecord>(
            predicate: #Predicate { $0.id == id }
        )

        do {
            return try context.fetch(descriptor).first
        } catch {
            return nil
        }
    }

    /// Insert a new prompt (created locally)
    func insertPrompt(_ record: LocalPromptRecord) {
        guard let context else {
            #if DEBUG
            print("[SwiftDataManager] Context unavailable for insertPrompt")
            #endif
            return
        }
        context.insert(record)
        saveContext()
    }

    /// Mark a prompt for deletion
    func markPromptForDeletion(id: String) {
        guard let context else { return }
        if let prompt = getPrompt(id: id) {
            if prompt.isSynced {
                prompt.pendingAction = .delete
            } else {
                // Never synced, just delete locally
                context.delete(prompt)
            }
            saveContext()
        }
    }

    /// Update favorite status (optimistic update)
    func toggleFavorite(id: String, newValue: Bool) {
        if let prompt = getPrompt(id: id) {
            prompt.isFavorite = newValue
            if prompt.pendingAction == nil {
                prompt.pendingAction = .toggleFavorite
            }
            saveContext()
        }
    }

    /// Mark a prompt as synced
    func markAsSynced(id: String, serverId: String? = nil) {
        if let prompt = getPrompt(id: id) {
            if let serverId, prompt.id != serverId {
                // Update to server-assigned ID
                prompt.id = serverId
            }
            prompt.isSynced = true
            prompt.lastSyncedAt = Date()
            prompt.pendingAction = nil
            saveContext()
        }
    }

    /// Delete a prompt after successful server deletion
    func deletePrompt(id: String) {
        guard let context else { return }
        if let prompt = getPrompt(id: id) {
            context.delete(prompt)
            saveContext()
        }
    }

    /// Clear all local prompts (for logout)
    func clearAllPrompts() {
        guard let context else { return }
        do {
            try context.delete(model: LocalPromptRecord.self)
            saveContext()
        } catch {
            #if DEBUG
            print("[SwiftDataManager] Failed to clear prompts: \(error)")
            #endif
        }
    }

    // MARK: - Save

    private func saveContext() {
        guard let context else { return }
        do {
            try context.save()
        } catch {
            #if DEBUG
            print("[SwiftDataManager] Failed to save context: \(error)")
            #endif
        }
    }
}
