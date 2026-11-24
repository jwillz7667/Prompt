//
//  ChatService.swift
//  Prompt
//
//  Typed access to `/api/v1/chat`. Transport, auth refresh, error mapping and
//  SSE parsing all live in APIClient; this type only knows routes and shapes.
//

import Foundation

nonisolated struct ChatService: Sendable {
    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    // MARK: - Conversations

    func listConversations(
        cursor: String?,
        limit: Int = ChatLimits.conversationPageSize
    ) async throws -> ChatConversationListResponse {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor {
            query.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await client.request(Self.path(["conversations"], query: query))
    }

    func createConversation(title: String?, systemPrompt: String?) async throws -> ChatConversation {
        let response: ChatConversationEnvelope = try await client.request(
            Self.path(["conversations"]),
            method: .post,
            body: ChatCreateConversationRequest(title: title, systemPrompt: systemPrompt)
        )
        return response.conversation
    }

    func fetchConversation(
        id: String,
        before messageId: String? = nil,
        limit: Int = ChatLimits.messagePageSize
    ) async throws -> ChatConversationDetailResponse {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let messageId {
            query.append(URLQueryItem(name: "before", value: messageId))
        }
        return try await client.request(Self.path(["conversations", id], query: query))
    }

    func updateConversation(
        id: String,
        title: ChatFieldUpdate<String> = .unchanged,
        systemPrompt: ChatFieldUpdate<String> = .unchanged
    ) async throws -> ChatConversation {
        let response: ChatConversationEnvelope = try await client.request(
            Self.path(["conversations", id]),
            method: .patch,
            body: ChatUpdateConversationRequest(title: title, systemPrompt: systemPrompt)
        )
        return response.conversation
    }

    func deleteConversation(id: String) async throws {
        try await client.requestVoid(Self.path(["conversations", id]), method: .delete)
    }

    // MARK: - Streaming

    /// Cancelling the consuming task cancels the HTTP request; the server
    /// then stores the partial reply as `stopped`.
    func streamReply(
        conversationId: String,
        content: String,
        clientMessageId: UUID
    ) async -> AsyncThrowingStream<ChatStreamEvent, Error> {
        await client.streamEvents(
            path: Self.path(["conversations", conversationId, "messages", "stream"]),
            body: ChatSendMessageRequest(
                content: content,
                clientMessageId: clientMessageId.uuidString.lowercased()
            ),
            as: ChatStreamEvent.self
        )
    }

    func streamRegeneration(
        conversationId: String,
        assistantMessageId: String
    ) async -> AsyncThrowingStream<ChatStreamEvent, Error> {
        await client.streamEvents(
            path: Self.path(["conversations", conversationId, "messages", assistantMessageId, "regenerate", "stream"]),
            body: ChatRegenerateRequest(),
            as: ChatStreamEvent.self
        )
    }

    // MARK: - Reports

    func reportMessage(id: String, reason: ChatReportReason, details: String?) async throws {
        let _: ChatReportResponse = try await client.request(
            Self.path(["messages", id, "report"]),
            method: .post,
            body: ChatReportRequest(reason: reason, details: details)
        )
    }

    // MARK: - Paths

    /// Builds `/chat/<segments>?<query>` with each id percent-encoded as a
    /// single path segment, so a malformed id can never alter the route.
    private static func path(_ segments: [String], query: [URLQueryItem] = []) -> String {
        var components = URLComponents()
        components.percentEncodedPath = "/chat/" + segments
            .map { $0.addingPercentEncoding(withAllowedCharacters: segmentAllowed) ?? $0 }
            .joined(separator: "/")
        if !query.isEmpty {
            components.queryItems = query
        }
        return components.percentEncodedPath + (components.percentEncodedQuery.map { "?\($0)" } ?? "")
    }

    private static let segmentAllowed: CharacterSet = {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        return allowed
    }()
}
