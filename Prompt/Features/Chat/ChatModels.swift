//
//  ChatModels.swift
//  Prompt
//
//  Wire and display models for the general-purpose assistant
//  (`/api/v1/chat`). Wire types are `nonisolated` because APIClient decodes
//  them on its own actor, not the MainActor.
//

import Foundation

// MARK: - Limits

/// Mirrors the server-side validation limits of the chat API.
nonisolated enum ChatLimits {
    static let maxMessageLength = 16_000
    static let maxTitleLength = 120
    static let maxSystemPromptLength = 4_000
    static let maxReportDetailsLength = 1_000
    static let conversationPageSize = 30
    static let messagePageSize = 50
}

// MARK: - Conversations

nonisolated struct ChatConversationSummary: Codable, Sendable, Identifiable, Hashable {
    let id: String
    var title: String?
    let createdAt: Date
    var updatedAt: Date
    var lastMessagePreview: String?
}

nonisolated struct ChatConversation: Codable, Sendable, Identifiable, Hashable {
    let id: String
    var title: String?
    var systemPrompt: String?
    let createdAt: Date
    var updatedAt: Date
}

extension ChatConversationSummary {
    var displayTitle: String { ChatConversation.displayTitle(for: title) }
}

extension ChatConversation {
    var displayTitle: String { Self.displayTitle(for: title) }

    nonisolated static func displayTitle(for title: String?) -> String {
        guard let title = title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else {
            return String(localized: "New chat")
        }
        return title
    }
}

// MARK: - Messages

nonisolated enum ChatRole: String, Codable, Sendable, Hashable {
    case user
    case assistant
}

nonisolated enum ChatMessageStatus: String, Codable, Sendable, Hashable {
    case complete
    case stopped
    case truncated
    case failed
}

nonisolated struct ChatMessage: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let role: ChatRole
    let content: String
    let status: ChatMessageStatus
    let createdAt: Date
}

// MARK: - Responses

nonisolated struct ChatConversationListResponse: Decodable, Sendable {
    let conversations: [ChatConversationSummary]
    let nextCursor: String?
}

nonisolated struct ChatConversationEnvelope: Decodable, Sendable {
    let conversation: ChatConversation
}

nonisolated struct ChatConversationDetailResponse: Decodable, Sendable {
    let conversation: ChatConversation
    let messages: [ChatMessage]
    let hasMore: Bool
}

nonisolated struct ChatReportResponse: Decodable, Sendable {
    let reported: Bool
}

// MARK: - Requests

nonisolated struct ChatCreateConversationRequest: Encodable, Sendable {
    let title: String?
    let systemPrompt: String?

    private enum CodingKeys: String, CodingKey {
        case title, systemPrompt
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(systemPrompt, forKey: .systemPrompt)
    }
}

/// A PATCH body field that distinguishes "leave unchanged" (omitted) from
/// "clear" (explicit JSON null).
nonisolated enum ChatFieldUpdate<Value: Sendable & Encodable & Hashable>: Sendable, Hashable {
    case unchanged
    case set(Value)
    case clear
}

nonisolated struct ChatUpdateConversationRequest: Encodable, Sendable {
    let title: ChatFieldUpdate<String>
    let systemPrompt: ChatFieldUpdate<String>

    private enum CodingKeys: String, CodingKey {
        case title, systemPrompt
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try Self.encode(title, forKey: .title, in: &container)
        try Self.encode(systemPrompt, forKey: .systemPrompt, in: &container)
    }

    private static func encode(
        _ update: ChatFieldUpdate<String>,
        forKey key: CodingKeys,
        in container: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        switch update {
        case .unchanged:
            break
        case .set(let value):
            try container.encode(value, forKey: key)
        case .clear:
            try container.encodeNil(forKey: key)
        }
    }
}

nonisolated struct ChatSendMessageRequest: Encodable, Sendable {
    let content: String
    let clientMessageId: String
}

nonisolated struct ChatRegenerateRequest: Encodable, Sendable {}

nonisolated enum ChatReportReason: String, Codable, Sendable, CaseIterable, Identifiable, Hashable {
    case harmful
    case inaccurate
    case inappropriate
    case other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .harmful: return String(localized: "Harmful or unsafe")
        case .inaccurate: return String(localized: "Inaccurate or misleading")
        case .inappropriate: return String(localized: "Inappropriate or offensive")
        case .other: return String(localized: "Something else")
        }
    }

    var systemImage: String {
        switch self {
        case .harmful: return "exclamationmark.shield"
        case .inaccurate: return "xmark.seal"
        case .inappropriate: return "hand.raised"
        case .other: return "ellipsis.bubble"
        }
    }
}

nonisolated struct ChatReportRequest: Encodable, Sendable {
    let reason: ChatReportReason
    let details: String?

    private enum CodingKeys: String, CodingKey {
        case reason, details
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(reason, forKey: .reason)
        try container.encodeIfPresent(details, forKey: .details)
    }
}

// MARK: - Stream Events

/// One `data:` payload of `/messages/stream` and `/regenerate/stream`.
/// Error events never reach consumers: `failure` makes APIClient throw them.
nonisolated struct ChatStreamEvent: ServerSentEvent {
    enum Kind: String, Decodable, Sendable {
        case start
        case token
        case complete
        case error
    }

    struct Usage: Decodable, Sendable, Hashable {
        let inputTokens: Int
        let outputTokens: Int
    }

    struct ConversationUpdate: Decodable, Sendable, Hashable {
        let id: String
        let title: String?
        let updatedAt: String
    }

    let type: Kind
    let userMessageId: String?
    let assistantMessageId: String?
    let content: String?
    let status: ChatMessageStatus?
    let usage: Usage?
    let conversation: ConversationUpdate?
    let code: String?
    let reason: String?
    let retryable: Bool?
    let retryAfterMs: Int?
    let resetAt: String?

    /// Losing a `start` would leave the optimistic messages without server
    /// ids, so it is treated as terminal-grade alongside complete/error.
    static var terminalEventTypes: Set<String> { ["start", "complete", "error"] }

    var failure: APIError? {
        guard type == .error else { return nil }
        return APIError.fromServerCode(
            code,
            reason: reason,
            retryable: retryable,
            retryAfterMs: retryAfterMs,
            resetAt: resetAt,
            remainingQuota: nil
        ) ?? .service(ServiceFailure(
            code: .internalError,
            isRetryable: retryable ?? true,
            retryAfter: retryAfterMs.map { TimeInterval($0) / 1000 }
        ))
    }
}

// MARK: - Display Models

/// Lifecycle of a transcript row. Server statuses plus the two client-only
/// phases an optimistic row passes through before the server confirms it.
nonisolated enum ChatTranscriptStatus: Sendable, Hashable {
    /// User message sent, server has not acknowledged it yet.
    case sending
    /// User message the server never accepted (failed before `start`).
    case notSent
    case complete
    case stopped
    case truncated
    case failed

    init(_ status: ChatMessageStatus) {
        switch status {
        case .complete: self = .complete
        case .stopped: self = .stopped
        case .truncated: self = .truncated
        case .failed: self = .failed
        }
    }
}

/// A transcript row. `id` is the stable SwiftUI identity; `serverId` is
/// filled in once the server acknowledges the message, so an optimistic row
/// keeps its identity (and scroll position) when it becomes real.
nonisolated struct ChatTranscriptMessage: Sendable, Identifiable, Hashable {
    let id: String
    var serverId: String?
    let role: ChatRole
    var content: String
    var status: ChatTranscriptStatus
    let createdAt: Date

    init(
        id: String,
        serverId: String?,
        role: ChatRole,
        content: String,
        status: ChatTranscriptStatus,
        createdAt: Date
    ) {
        self.id = id
        self.serverId = serverId
        self.role = role
        self.content = content
        self.status = status
        self.createdAt = createdAt
    }

    init(_ message: ChatMessage) {
        self.init(
            id: message.id,
            serverId: message.id,
            role: message.role,
            content: message.content,
            status: ChatTranscriptStatus(message.status),
            createdAt: message.createdAt
        )
    }
}

/// A starter prompt shown on the empty conversation screen.
struct ChatStarterSuggestion: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let systemImage: String
    let prompt: String

    static let defaults: [ChatStarterSuggestion] = [
        ChatStarterSuggestion(
            id: "explain",
            title: String(localized: "Explain a concept"),
            subtitle: String(localized: "in simple terms"),
            systemImage: "lightbulb",
            prompt: String(localized: "Explain how compound interest works in simple terms, with a short example.")
        ),
        ChatStarterSuggestion(
            id: "email",
            title: String(localized: "Draft an email"),
            subtitle: String(localized: "polite and to the point"),
            systemImage: "envelope",
            prompt: String(localized: "Help me write a short, friendly email asking my manager to move our 1:1 to Thursday.")
        ),
        ChatStarterSuggestion(
            id: "plan",
            title: String(localized: "Plan my week"),
            subtitle: String(localized: "with a simple schedule"),
            systemImage: "calendar",
            prompt: String(localized: "Make a simple weekly plan that fits three 30-minute workouts and two evenings of focused study.")
        ),
        ChatStarterSuggestion(
            id: "code",
            title: String(localized: "Write some code"),
            subtitle: String(localized: "and explain it"),
            systemImage: "chevron.left.forwardslash.chevron.right",
            prompt: String(localized: "Write a Swift function that removes duplicate items from an array while keeping their order, and explain how it works.")
        )
    ]
}
