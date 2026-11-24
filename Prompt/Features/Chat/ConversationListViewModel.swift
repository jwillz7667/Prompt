//
//  ConversationListViewModel.swift
//  Prompt
//
//  Cursor-paginated list of assistant conversations for the drawer.
//

import Foundation
import Observation

@MainActor
@Observable
final class ConversationListViewModel {
    enum LoadState: Equatable, Sendable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    private(set) var conversations: [ChatConversationSummary] = []
    private(set) var state: LoadState = .idle
    private(set) var isLoadingMore = false
    private(set) var nextCursor: String?

    @ObservationIgnored private let service: ChatService
    @ObservationIgnored private let errorHandler: ErrorHandler
    @ObservationIgnored private var generation = 0

    /// `errorHandler` defaults to the shared instance inside the body because
    /// default arguments are evaluated outside the MainActor.
    init(service: ChatService = ChatService(), errorHandler: ErrorHandler? = nil) {
        self.service = service
        self.errorHandler = errorHandler ?? .shared
    }

    var hasMore: Bool { nextCursor != nil }

    func refresh() async {
        generation += 1
        let current = generation
        if conversations.isEmpty { state = .loading }
        isLoadingMore = false

        do {
            let page = try await service.listConversations(cursor: nil)
            guard current == generation else { return }
            conversations = page.conversations
            nextCursor = page.nextCursor
            state = .loaded
        } catch {
            guard current == generation else { return }
            errorHandler.handleSilently(error, context: "chat.listConversations")
            // Keep showing what we have; only an empty list shows the error.
            state = conversations.isEmpty ? .failed(ChatViewModel.userMessage(for: error)) : .loaded
        }
    }

    /// Fetches the next page once the given row (normally the last) appears.
    func loadMoreIfNeeded(after conversation: ChatConversationSummary) async {
        guard conversation.id == conversations.last?.id,
              let cursor = nextCursor,
              !isLoadingMore,
              state == .loaded else { return }
        let current = generation
        isLoadingMore = true
        defer {
            if current == generation { isLoadingMore = false }
        }

        do {
            let page = try await service.listConversations(cursor: cursor)
            guard current == generation else { return }
            let known = Set(conversations.map(\.id))
            conversations.append(contentsOf: page.conversations.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch {
            guard current == generation else { return }
            errorHandler.handleSilently(error, context: "chat.listConversations.more")
            // Stop paging; pull-to-refresh or reopening the drawer restarts it.
            nextCursor = nil
        }
    }

    func rename(id: String, to title: String) async throws -> ChatConversation {
        let trimmed = String(
            title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(ChatLimits.maxTitleLength)
        )
        guard !trimmed.isEmpty else { throw APIError.badRequest(String(localized: "Enter a name for this chat.")) }
        let updated = try await service.updateConversation(id: id, title: .set(trimmed))
        if let index = conversations.firstIndex(where: { $0.id == id }) {
            conversations[index].title = updated.title
        }
        return updated
    }

    func delete(id: String) async throws {
        try await service.deleteConversation(id: id)
        conversations.removeAll { $0.id == id }
    }
}

extension ConversationListViewModel: ChatConversationListSyncing {
    func conversationDidChange(_ summary: ChatConversationSummary) {
        var merged = summary
        if let index = conversations.firstIndex(where: { $0.id == summary.id }) {
            if merged.lastMessagePreview == nil {
                merged.lastMessagePreview = conversations[index].lastMessagePreview
            }
            conversations.remove(at: index)
        }
        // Ordered by updatedAt desc; a changed conversation is the newest.
        let insertAt = conversations.firstIndex(where: { $0.updatedAt <= merged.updatedAt }) ?? conversations.endIndex
        conversations.insert(merged, at: insertAt)
        if state == .idle { state = .loaded }
    }

    func conversationWasDeleted(id: String) {
        conversations.removeAll { $0.id == id }
    }
}
