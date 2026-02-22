//
//  ThreadModels.swift
//  Prompt
//
//  Data models for conversation threads (multi-turn prompt enhancement)
//

import Foundation

// MARK: - API Response DTOs

struct ThreadDTO: Codable, Sendable {
    let id: String
    let title: String?
    let modality: String
    let isArchived: Bool
    let turnCount: Int
    let lastPreview: String?
    let createdAt: String
    let updatedAt: String
}

struct ThreadDetailDTO: Codable, Sendable {
    let id: String
    let title: String?
    let modality: String
    let isArchived: Bool
    let createdAt: String
    let updatedAt: String
    let turns: [ThreadTurnDTO]
}

struct ThreadTurnDTO: Codable, Sendable {
    let id: String
    let threadId: String
    let turnIndex: Int
    let originalPrompt: String
    let enhancedPrompt: String
    let model: String
    let inputTokens: Int
    let outputTokens: Int
    let totalTokens: Int
    let processingMs: Int
    let createdAt: String
}

// MARK: - API Responses

struct ThreadListResponse: Decodable, Sendable {
    let threads: [ThreadDTO]
    let pagination: PaginationInfo

    struct PaginationInfo: Decodable, Sendable {
        let page: Int
        let limit: Int
        let total: Int
        let totalPages: Int
    }
}

struct ThreadDetailResponse: Decodable, Sendable {
    let thread: ThreadDetailDTO
}

struct ThreadUpdateResponse: Decodable, Sendable {
    let thread: ThreadDTO
}

// MARK: - API Request Bodies

struct CreateThreadRequest: Encodable, Sendable {
    let prompt: String
    let title: String?
    let modality: String
    let subModality: String?
    let tone: String?
    let length: String?
    let customInstructions: String?
}

struct AddTurnRequest: Encodable, Sendable {
    let prompt: String
    let subModality: String?
    let tone: String?
    let length: String?
    let customInstructions: String?
}

struct UpdateThreadRequest: Encodable, Sendable {
    let title: String?
    let isArchived: Bool?
}

// MARK: - UI Display Models

struct ThreadRecord: Identifiable, Sendable {
    let id: String
    let title: String
    let modality: String
    let isArchived: Bool
    let turnCount: Int
    let lastPreview: String?
    let createdAt: Date
    let updatedAt: Date

    init(from dto: ThreadDTO) {
        self.id = dto.id
        self.title = dto.title ?? "Untitled Thread"
        self.modality = dto.modality
        self.isArchived = dto.isArchived
        self.turnCount = dto.turnCount
        self.lastPreview = dto.lastPreview
        self.createdAt = ISO8601DateFormatter().date(from: dto.createdAt) ?? Date()
        self.updatedAt = ISO8601DateFormatter().date(from: dto.updatedAt) ?? Date()
    }
}

struct ThreadTurnRecord: Identifiable, Sendable {
    let id: String
    let turnIndex: Int
    let originalPrompt: String
    let enhancedPrompt: String
    let model: String
    let totalTokens: Int
    let processingMs: Int
    let createdAt: Date

    init(from dto: ThreadTurnDTO) {
        self.id = dto.id
        self.turnIndex = dto.turnIndex
        self.originalPrompt = dto.originalPrompt
        self.enhancedPrompt = dto.enhancedPrompt
        self.model = dto.model
        self.totalTokens = dto.totalTokens
        self.processingMs = dto.processingMs
        self.createdAt = ISO8601DateFormatter().date(from: dto.createdAt) ?? Date()
    }
}

/// Represents a single message in the thread chat UI
struct ThreadMessage: Identifiable, Sendable {
    let id: String
    let role: Role
    let content: String
    let turnIndex: Int
    let tokens: Int?

    enum Role: Sendable {
        case user
        case assistant
    }
}

