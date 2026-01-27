//
//  LocalPromptRecord.swift
//  Prompt
//
//  SwiftData model for offline prompt storage
//

import Foundation
import SwiftData

/// Pending action for offline sync queue
enum PendingAction: String, Codable {
    case create
    case update
    case delete
    case toggleFavorite
}

/// Local SwiftData model for prompt records with offline support
@Model
final class LocalPromptRecord {
    /// Unique identifier from server (or local UUID for pending creates)
    @Attribute(.unique) var id: String

    /// Original user prompt
    var originalPrompt: String

    /// AI-enhanced prompt
    var enhancedPrompt: String

    /// Model used for enhancement (e.g., "deepseek-reasoner")
    var model: String

    /// Total tokens used for this prompt
    var totalTokens: Int

    /// Optional user-defined title
    var title: String?

    /// Searchable tags
    var tags: [String]

    /// User favorite status
    var isFavorite: Bool

    /// Archived status
    var isArchived: Bool

    /// Creation timestamp
    var createdAt: Date

    /// Whether this record has been synced to server
    var isSynced: Bool

    /// Last successful sync timestamp
    var lastSyncedAt: Date?

    /// Pending action in sync queue (nil if fully synced)
    var pendingActionRaw: String?

    /// Computed property for pending action enum
    var pendingAction: PendingAction? {
        get {
            guard let raw = pendingActionRaw else { return nil }
            return PendingAction(rawValue: raw)
        }
        set {
            pendingActionRaw = newValue?.rawValue
        }
    }

    init(
        id: String = UUID().uuidString,
        originalPrompt: String,
        enhancedPrompt: String,
        model: String,
        totalTokens: Int,
        title: String? = nil,
        tags: [String] = [],
        isFavorite: Bool = false,
        isArchived: Bool = false,
        createdAt: Date = Date(),
        isSynced: Bool = false,
        lastSyncedAt: Date? = nil,
        pendingAction: PendingAction? = nil
    ) {
        self.id = id
        self.originalPrompt = originalPrompt
        self.enhancedPrompt = enhancedPrompt
        self.model = model
        self.totalTokens = totalTokens
        self.title = title
        self.tags = tags
        self.isFavorite = isFavorite
        self.isArchived = isArchived
        self.createdAt = createdAt
        self.isSynced = isSynced
        self.lastSyncedAt = lastSyncedAt
        self.pendingActionRaw = pendingAction?.rawValue
    }

    /// Create from PromptRecord (API response)
    convenience init(from record: PromptRecord) {
        self.init(
            id: record.id,
            originalPrompt: record.originalPrompt,
            enhancedPrompt: record.enhancedPrompt,
            model: record.model,
            totalTokens: record.totalTokens,
            title: record.title,
            tags: record.tags,
            isFavorite: record.isFavorite,
            isArchived: record.isArchived,
            createdAt: record.createdAt,
            isSynced: true,
            lastSyncedAt: Date()
        )
    }

    /// Convert to PromptRecord for UI compatibility
    func toPromptRecord() -> PromptRecord {
        let dto = PromptDTO(
            id: id,
            originalPrompt: originalPrompt,
            enhancedPrompt: enhancedPrompt,
            model: model,
            totalTokens: totalTokens,
            title: title,
            tags: tags,
            isFavorite: isFavorite,
            isArchived: isArchived,
            createdAt: ISO8601DateFormatter().string(from: createdAt)
        )
        return PromptRecord(from: dto)
    }
}
