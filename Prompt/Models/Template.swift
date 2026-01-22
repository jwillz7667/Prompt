//
//  Template.swift
//  Prompt
//
//  Model for reusable prompt templates
//

import Foundation

struct Template: Identifiable, Codable, Sendable {
    let id: String
    let name: String
    let content: String
    let description: String?
    let category: String
    let icon: String?
    let isBuiltIn: Bool
    let usageCount: Int
    let createdAt: Date

    init(from dto: TemplateDTO) {
        self.id = dto.id
        self.name = dto.name
        self.content = dto.content
        self.description = dto.description
        self.category = dto.category
        self.icon = dto.icon ?? "doc.text"
        self.isBuiltIn = dto.isBuiltIn
        self.usageCount = dto.usageCount
        self.createdAt = ISO8601DateFormatter().date(from: dto.createdAt) ?? Date()
    }
}

struct TemplateDTO: Codable, Sendable {
    let id: String
    let name: String
    let content: String
    let description: String?
    let category: String
    let icon: String?
    let isBuiltIn: Bool
    let usageCount: Int
    let createdAt: String
}

struct TemplatesListResponse: Decodable, Sendable {
    let templates: [TemplateDTO]
    let categories: [String]
    let pagination: PaginationInfo
}

struct TemplateResponse: Decodable, Sendable {
    let template: TemplateDTO
}

struct CreateTemplateRequest: Encodable, Sendable {
    let name: String
    let content: String
    let description: String?
    let category: String
    let icon: String?
}

// MARK: - Built-in Template Categories

enum TemplateCategory: String, CaseIterable, Identifiable {
    case general = "General"
    case coding = "Coding"
    case writing = "Writing"
    case business = "Business"
    case creative = "Creative"
    case research = "Research"
    case analysis = "Analysis"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .general: return "doc.text"
        case .coding: return "chevron.left.forwardslash.chevron.right"
        case .writing: return "pencil.line"
        case .business: return "briefcase"
        case .creative: return "paintbrush"
        case .research: return "magnifyingglass"
        case .analysis: return "chart.bar"
        }
    }

    var color: String {
        switch self {
        case .general: return "#8E8E93"
        case .coding: return "#5856D6"
        case .writing: return "#007AFF"
        case .business: return "#34C759"
        case .creative: return "#FF9500"
        case .research: return "#AF52DE"
        case .analysis: return "#FF3B30"
        }
    }
}
