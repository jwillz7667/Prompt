//
//  SwiftDataManager.swift
//  Prompt
//
//  SwiftData persistence layer for offline support
//

import Foundation
import SwiftData
import SwiftUI

/// Manages SwiftData persistence for offline prompt and template storage
@MainActor
final class SwiftDataManager {
    // MARK: - Singleton

    static let shared = SwiftDataManager()

    // MARK: - Model Container

    let modelContainer: ModelContainer

    private init() {
        // Configure for App Group to share with widget extension
        // Disable CloudKit sync - we use our own backend sync
        let schema = Schema([
            LocalPromptRecord.self,
            LocalTemplate.self,
        ])

        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true,
            groupContainer: .identifier("group.com.res.promptomizer"),
            cloudKitDatabase: .none  // Disable CloudKit - use local storage only
        )

        do {
            modelContainer = try ModelContainer(
                for: schema,
                configurations: [config]
            )
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    // MARK: - Context

    var context: ModelContext {
        modelContainer.mainContext
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

        do {
            return try context.fetch(descriptor)
        } catch {
            print("[SwiftDataManager] Failed to fetch prompts: \(error)")
            return []
        }
    }

    /// Fetch prompts with pending actions (for sync)
    func fetchPendingPrompts() -> [LocalPromptRecord] {
        let descriptor = FetchDescriptor<LocalPromptRecord>(
            predicate: #Predicate { $0.pendingActionRaw != nil },
            sortBy: [SortDescriptor(\.createdAt)]
        )

        do {
            return try context.fetch(descriptor)
        } catch {
            print("[SwiftDataManager] Failed to fetch pending prompts: \(error)")
            return []
        }
    }

    /// Count of pending prompts
    var pendingCount: Int {
        fetchPendingPrompts().count
    }

    /// Insert or update prompts from API response
    func upsertPrompts(_ records: [PromptRecord]) {
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
                print("[SwiftDataManager] Failed to upsert prompt \(record.id): \(error)")
            }
        }

        saveContext()
    }

    /// Get a single prompt by ID
    func getPrompt(id: String) -> LocalPromptRecord? {
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
        context.insert(record)
        saveContext()
    }

    /// Mark a prompt for deletion
    func markPromptForDeletion(id: String) {
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
        if let prompt = getPrompt(id: id) {
            context.delete(prompt)
            saveContext()
        }
    }

    /// Clear all local prompts (for logout)
    func clearAllPrompts() {
        do {
            try context.delete(model: LocalPromptRecord.self)
            saveContext()
        } catch {
            print("[SwiftDataManager] Failed to clear prompts: \(error)")
        }
    }

    // MARK: - Template Operations

    /// Fetch all templates
    func fetchTemplates(category: String? = nil) -> [LocalTemplate] {
        var descriptor = FetchDescriptor<LocalTemplate>(
            sortBy: [SortDescriptor(\.usageCount, order: .reverse)]
        )

        if let category {
            descriptor.predicate = #Predicate { $0.category == category }
        }

        do {
            return try context.fetch(descriptor)
        } catch {
            print("[SwiftDataManager] Failed to fetch templates: \(error)")
            return []
        }
    }

    /// Insert or update templates from API response
    func upsertTemplates(_ templates: [Template]) {
        for template in templates {
            let descriptor = FetchDescriptor<LocalTemplate>(
                predicate: #Predicate { $0.id == template.id }
            )

            do {
                let existing = try context.fetch(descriptor)
                if let local = existing.first {
                    local.name = template.name
                    local.templateDescription = template.description
                    local.content = template.content
                    local.category = template.category
                    local.icon = template.icon
                    local.isBuiltIn = template.isBuiltIn
                    local.usageCount = template.usageCount
                    local.isSynced = true
                    local.lastSyncedAt = Date()
                } else {
                    let local = LocalTemplate(from: template)
                    context.insert(local)
                }
            } catch {
                print("[SwiftDataManager] Failed to upsert template \(template.id): \(error)")
            }
        }

        saveContext()
    }

    /// Clear all local templates
    func clearAllTemplates() {
        do {
            try context.delete(model: LocalTemplate.self)
            saveContext()
        } catch {
            print("[SwiftDataManager] Failed to clear templates: \(error)")
        }
    }

    // MARK: - Save

    private func saveContext() {
        do {
            try context.save()
        } catch {
            print("[SwiftDataManager] Failed to save context: \(error)")
        }
    }
}
