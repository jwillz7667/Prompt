//
//  LocalTemplate.swift
//  Prompt
//
//  SwiftData model for offline template caching
//

import Foundation
import SwiftData

/// Local SwiftData model for template caching
@Model
final class LocalTemplate {
    /// Unique identifier from server
    @Attribute(.unique) var id: String

    /// Template name
    var name: String

    /// Template content (the actual prompt text)
    var content: String

    /// Template description
    var templateDescription: String?

    /// Category for organization
    var category: String

    /// Icon name
    var icon: String?

    /// Whether this is a built-in template (vs user-created)
    var isBuiltIn: Bool

    /// Usage count for sorting by popularity
    var usageCount: Int

    /// Creation timestamp
    var createdAt: Date

    /// Whether this record has been synced to server
    var isSynced: Bool

    /// Last successful sync timestamp
    var lastSyncedAt: Date?

    init(
        id: String = UUID().uuidString,
        name: String,
        content: String,
        templateDescription: String? = nil,
        category: String = "General",
        icon: String? = nil,
        isBuiltIn: Bool = false,
        usageCount: Int = 0,
        createdAt: Date = Date(),
        isSynced: Bool = false,
        lastSyncedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.content = content
        self.templateDescription = templateDescription
        self.category = category
        self.icon = icon
        self.isBuiltIn = isBuiltIn
        self.usageCount = usageCount
        self.createdAt = createdAt
        self.isSynced = isSynced
        self.lastSyncedAt = lastSyncedAt
    }

    /// Create from Template model
    convenience init(from template: Template) {
        self.init(
            id: template.id,
            name: template.name,
            content: template.content,
            templateDescription: template.description,
            category: template.category,
            icon: template.icon,
            isBuiltIn: template.isBuiltIn,
            usageCount: template.usageCount,
            createdAt: template.createdAt,
            isSynced: true,
            lastSyncedAt: Date()
        )
    }

    /// Convert to TemplateDTO then Template for UI compatibility
    func toTemplate() -> Template {
        let dto = TemplateDTO(
            id: id,
            name: name,
            content: content,
            description: templateDescription,
            category: category,
            icon: icon,
            isBuiltIn: isBuiltIn,
            usageCount: usageCount,
            createdAt: ISO8601DateFormatter().string(from: createdAt)
        )
        return Template(from: dto)
    }
}
