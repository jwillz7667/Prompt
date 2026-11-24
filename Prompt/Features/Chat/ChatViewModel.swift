//
//  ChatViewModel.swift
//  Prompt
//
//  State machine for one assistant conversation: loading and paging the
//  transcript, optimistic sends, throttled token streaming, stop, regenerate,
//  retry, settings and reports.
//

import Foundation
import Observation

/// Receives conversation changes made from the chat screen so the drawer list
/// stays current without refetching.
@MainActor
protocol ChatConversationListSyncing: AnyObject {
    func conversationDidChange(_ summary: ChatConversationSummary)
    func conversationWasDeleted(id: String)
}

/// What the Retry button of the error banner does.
enum ChatRetryAction: Equatable, Sendable {
    /// Re-send a user message the server never accepted, with the same
    /// idempotency key.
    case resend(rowId: String)
    /// Ask for a new reply in place of the latest assistant message.
    case regenerate(assistantMessageId: String)
    /// Reload the transcript from the server.
    case reload
}

struct ChatErrorBanner: Identifiable, Equatable, Sendable {
    let id = UUID()
    let message: String
    let retry: ChatRetryAction?
    /// The server asked the client to wait before retrying.
    let retryAvailableAt: Date?
}

@MainActor
@Observable
final class ChatViewModel {
    enum StreamPhase: Equatable, Sendable {
        case idle
        /// Request sent, no token yet.
        case waiting
        case streaming
    }

    enum LoadState: Equatable, Sendable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    // MARK: - Transcript

    private(set) var conversation: ChatConversation?
    private(set) var messages: [ChatTranscriptMessage] = []
    private(set) var hasOlderMessages = false
    private(set) var isLoadingOlderMessages = false
    private(set) var loadState: LoadState = .idle
    /// Bumped whenever the transcript is replaced wholesale, so the view can
    /// jump to the newest message without animating.
    private(set) var transcriptRevision = 0

    // MARK: - Composer

    var draft = ""
    /// Settings chosen before the first message creates the conversation.
    private(set) var pendingTitle: String?
    private(set) var pendingSystemPrompt: String?

    // MARK: - Streaming

    private(set) var phase: StreamPhase = .idle
    /// Row id of the assistant message being streamed. Only the streaming row
    /// reads `streamingText`, so token updates never re-render the list.
    private(set) var streamingMessageId: String?
    private(set) var streamingText = ""
    private(set) var banner: ChatErrorBanner?

    // MARK: - Feedback triggers (drive `.sensoryFeedback`)

    private(set) var sendCount = 0
    private(set) var completionCount = 0
    private(set) var failureCount = 0

    // MARK: - Dependencies & bookkeeping

    @ObservationIgnored weak var listSync: (any ChatConversationListSyncing)?
    @ObservationIgnored private let service: ChatService
    @ObservationIgnored private let errorHandler: ErrorHandler
    @ObservationIgnored private var activeStream: ActiveStream?
    @ObservationIgnored private var streamTask: Task<Void, Never>?
    @ObservationIgnored private var flushTask: Task<Void, Never>?
    @ObservationIgnored private var tokenBuffer = ""
    @ObservationIgnored private var streamGeneration = 0
    @ObservationIgnored private var loadGeneration = 0
    /// Idempotency keys of user rows the server has not accepted yet.
    @ObservationIgnored private var unsentClientIds: [String: UUID] = [:]
    @ObservationIgnored private var lastRequestedConversationId: String?

    /// ~30 fps: smooth enough to read as continuous, cheap enough that
    /// re-parsing Markdown per flush stays off the critical path.
    private static let tokenFlushInterval: Duration = .milliseconds(33)
    private static let previewLength = 140

    /// `errorHandler` defaults to the shared instance inside the body because
    /// default arguments are evaluated outside the MainActor.
    init(service: ChatService = ChatService(), errorHandler: ErrorHandler? = nil) {
        self.service = service
        self.errorHandler = errorHandler ?? .shared
    }

    // MARK: - Derived State

    var isStreaming: Bool { streamingMessageId != nil }

    var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    var isDraftTooLong: Bool { trimmedDraft.count > ChatLimits.maxMessageLength }

    var canSend: Bool {
        !isStreaming && !trimmedDraft.isEmpty && !isDraftTooLong && loadState != .loading
    }

    var hasTranscript: Bool { !messages.isEmpty }

    var effectiveSystemPrompt: String? { conversation?.systemPrompt ?? pendingSystemPrompt }

    var effectiveTitle: String? { conversation?.title ?? pendingTitle }

    var displayTitle: String { ChatConversation.displayTitle(for: effectiveTitle) }

    func canRegenerate(_ message: ChatTranscriptMessage) -> Bool {
        guard !isStreaming,
              message.role == .assistant,
              message.serverId != nil,
              message.status != .notSent else { return false }
        return messages.last?.id == message.id
    }

    // MARK: - Conversation Lifecycle

    func startNewConversation() {
        stopStreaming()
        loadGeneration += 1
        conversation = nil
        messages = []
        hasOlderMessages = false
        isLoadingOlderMessages = false
        loadState = .idle
        pendingTitle = nil
        pendingSystemPrompt = nil
        banner = nil
        unsentClientIds = [:]
        transcriptRevision += 1
    }

    func openConversation(id: String) async {
        if conversation?.id == id, loadState == .loaded { return }
        stopStreaming()
        loadGeneration += 1
        let generation = loadGeneration
        conversation = nil
        messages = []
        hasOlderMessages = false
        pendingTitle = nil
        pendingSystemPrompt = nil
        banner = nil
        unsentClientIds = [:]
        lastRequestedConversationId = id
        loadState = .loading
        transcriptRevision += 1

        do {
            let detail = try await service.fetchConversation(id: id)
            guard generation == loadGeneration else { return }
            apply(detail)
        } catch {
            guard generation == loadGeneration else { return }
            if case APIError.notFound = error {
                listSync?.conversationWasDeleted(id: id)
                startNewConversation()
                return
            }
            errorHandler.handleSilently(error, context: "chat.openConversation")
            loadState = .failed(Self.userMessage(for: error))
        }
    }

    /// Re-reads the newest page from the server, discarding local-only rows.
    func reloadConversation() async {
        guard let id = conversation?.id, !isStreaming else { return }
        loadGeneration += 1
        let generation = loadGeneration
        banner = nil
        do {
            let detail = try await service.fetchConversation(id: id)
            guard generation == loadGeneration else { return }
            unsentClientIds = [:]
            apply(detail)
        } catch {
            guard generation == loadGeneration else { return }
            errorHandler.handleSilently(error, context: "chat.reloadConversation")
            presentBanner(for: error, retry: .reload)
        }
    }

    func retryLoad() async {
        guard case .failed = loadState, let id = lastRequestedConversationId else { return }
        await openConversation(id: id)
    }

    /// Loads the page before the oldest loaded message.
    func loadOlderMessages() async {
        guard hasOlderMessages,
              !isLoadingOlderMessages,
              let conversationId = conversation?.id,
              let oldestId = messages.first(where: { $0.serverId != nil })?.serverId else { return }
        let generation = loadGeneration
        isLoadingOlderMessages = true
        defer {
            if generation == loadGeneration { isLoadingOlderMessages = false }
        }

        do {
            let page = try await service.fetchConversation(id: conversationId, before: oldestId)
            guard generation == loadGeneration else { return }
            let knownIds = Set(messages.compactMap(\.serverId))
            let older = page.messages
                .filter { !knownIds.contains($0.id) }
                .map(ChatTranscriptMessage.init)
            messages.insert(contentsOf: older, at: 0)
            hasOlderMessages = page.hasMore
        } catch {
            guard generation == loadGeneration else { return }
            errorHandler.handleSilently(error, context: "chat.loadOlderMessages")
            // Without this the top spinner would re-trigger forever.
            hasOlderMessages = false
            presentBanner(for: error, retry: .reload)
        }
    }

    // MARK: - Settings

    /// Applies a title and custom instructions. Before the conversation
    /// exists they are kept locally and sent with the create request.
    func updateSettings(title: String, systemPrompt: String) async throws {
        let newTitle = Self.normalized(title, limit: ChatLimits.maxTitleLength)
        let newSystemPrompt = Self.normalized(systemPrompt, limit: ChatLimits.maxSystemPromptLength)

        guard let current = conversation else {
            pendingTitle = newTitle
            pendingSystemPrompt = newSystemPrompt
            return
        }

        let titleUpdate: ChatFieldUpdate<String> = {
            guard let newTitle, newTitle != current.title else { return .unchanged }
            return .set(newTitle)
        }()
        let promptUpdate: ChatFieldUpdate<String> = {
            guard newSystemPrompt != current.systemPrompt else { return .unchanged }
            return newSystemPrompt.map { .set($0) } ?? .clear
        }()
        guard titleUpdate != .unchanged || promptUpdate != .unchanged else { return }

        let updated = try await service.updateConversation(
            id: current.id,
            title: titleUpdate,
            systemPrompt: promptUpdate
        )
        applyConversationChange(updated)
    }

    func rename(to title: String) async throws {
        try await updateSettings(title: title, systemPrompt: effectiveSystemPrompt ?? "")
    }

    func deleteCurrentConversation() async throws {
        guard let id = conversation?.id else {
            startNewConversation()
            return
        }
        stopStreaming()
        try await service.deleteConversation(id: id)
        listSync?.conversationWasDeleted(id: id)
        startNewConversation()
    }

    /// Called when the drawer renamed or deleted a conversation.
    func conversationWasRenamed(_ updated: ChatConversation) {
        guard conversation?.id == updated.id else { return }
        conversation = updated
    }

    func conversationWasDeleted(id: String) {
        guard conversation?.id == id else { return }
        startNewConversation()
    }

    // MARK: - Reports

    func report(_ message: ChatTranscriptMessage, reason: ChatReportReason, details: String) async throws {
        guard let serverId = message.serverId else { throw APIError.notFound }
        try await service.reportMessage(
            id: serverId,
            reason: reason,
            details: Self.normalized(details, limit: ChatLimits.maxReportDetailsLength)
        )
    }

    // MARK: - Sending

    func sendDraft() {
        guard canSend else { return }
        let content = trimmedDraft
        draft = ""
        send(content)
    }

    func sendSuggestion(_ suggestion: ChatStarterSuggestion) {
        guard !isStreaming, loadState != .loading else { return }
        send(suggestion.prompt)
    }

    private func send(_ content: String) {
        let clientMessageId = UUID()
        let row = ChatTranscriptMessage(
            id: clientMessageId.uuidString.lowercased(),
            serverId: nil,
            role: .user,
            content: content,
            status: .sending,
            createdAt: Date()
        )
        messages.append(row)
        unsentClientIds[row.id] = clientMessageId
        banner = nil
        sendCount += 1
        beginStream(.send(content: content, clientMessageId: clientMessageId, userRowId: row.id))
    }

    /// Re-sends a user message that failed before the server accepted it.
    func retryUnsent(rowId: String) {
        guard !isStreaming,
              let index = messages.firstIndex(where: { $0.id == rowId }),
              messages[index].status == .notSent,
              let clientMessageId = unsentClientIds[rowId] else { return }
        messages[index].status = .sending
        banner = nil
        sendCount += 1
        beginStream(.send(content: messages[index].content, clientMessageId: clientMessageId, userRowId: rowId))
    }

    /// Removes an unsent message and puts its text back in the composer.
    func editUnsent(rowId: String) {
        guard !isStreaming,
              let index = messages.firstIndex(where: { $0.id == rowId }),
              messages[index].status == .notSent else { return }
        let removed = messages.remove(at: index)
        unsentClientIds[rowId] = nil
        draft = removed.content
        banner = nil
    }

    func regenerate(_ message: ChatTranscriptMessage) {
        guard canRegenerate(message), let serverId = message.serverId else { return }
        banner = nil
        sendCount += 1
        beginStream(.regenerate(assistantMessageId: serverId, original: message))
    }

    func performRetry(_ action: ChatRetryAction) {
        switch action {
        case .resend(let rowId):
            retryUnsent(rowId: rowId)
        case .regenerate(let assistantMessageId):
            guard let message = messages.last(where: { $0.serverId == assistantMessageId }) else {
                Task { await reloadConversation() }
                return
            }
            regenerate(message)
        case .reload:
            Task { await reloadConversation() }
        }
    }

    func dismissBanner() {
        banner = nil
    }

    // MARK: - Stop

    /// Cancels the in-flight reply. Cancelling the task cancels the HTTP
    /// request, which the server observes and stores as `stopped`.
    func stopStreaming() {
        guard let stream = activeStream else { return }
        flushTokens()
        let text = streamingText
        streamTask?.cancel()
        streamTask = nil
        finishStream()

        switch stream.request {
        case .send(let content, _, let userRowId):
            if stream.didStart {
                settleReply(stream, text: text, status: .stopped)
            } else {
                // The server never acknowledged the message: hand it back.
                removeRow(id: stream.replyRowId)
                removeRow(id: userRowId)
                unsentClientIds[userRowId] = nil
                if draft.isEmpty { draft = content }
            }
        case .regenerate(_, let original):
            if stream.didStart {
                settleReply(stream, text: text, status: .stopped)
            } else {
                replaceRow(id: stream.replyRowId, with: original)
            }
        }
    }

    // MARK: - Stream Engine

    private enum StreamRequest {
        case send(content: String, clientMessageId: UUID, userRowId: String)
        case regenerate(assistantMessageId: String, original: ChatTranscriptMessage)
    }

    private struct ActiveStream {
        let generation: Int
        let request: StreamRequest
        let replyRowId: String
        var didStart = false
        var assistantServerId: String?
    }

    private enum StreamOutcome {
        case completed
        case endedEarly
    }

    private func beginStream(_ request: StreamRequest) {
        streamGeneration += 1
        let generation = streamGeneration
        let replyRowId = "reply-\(UUID().uuidString.lowercased())"
        let placeholder = ChatTranscriptMessage(
            id: replyRowId,
            serverId: nil,
            role: .assistant,
            content: "",
            status: .complete,
            createdAt: Date()
        )

        switch request {
        case .send:
            messages.append(placeholder)
        case .regenerate(_, let original):
            replaceRow(id: original.id, with: placeholder)
        }

        activeStream = ActiveStream(generation: generation, request: request, replyRowId: replyRowId)
        tokenBuffer = ""
        streamingText = ""
        streamingMessageId = replyRowId
        phase = .waiting

        streamTask = Task { [weak self] in
            await self?.runStream(request, generation: generation)
        }
    }

    private func runStream(_ request: StreamRequest, generation: Int) async {
        do {
            let events: AsyncThrowingStream<ChatStreamEvent, Error>
            switch request {
            case .send(let content, let clientMessageId, _):
                let conversationId = try await ensureConversation()
                guard isCurrent(generation) else { return }
                events = await service.streamReply(
                    conversationId: conversationId,
                    content: content,
                    clientMessageId: clientMessageId
                )
            case .regenerate(let assistantMessageId, _):
                guard let conversationId = conversation?.id else { throw APIError.notFound }
                events = await service.streamRegeneration(
                    conversationId: conversationId,
                    assistantMessageId: assistantMessageId
                )
            }

            var outcome = StreamOutcome.endedEarly
            for try await event in events {
                guard isCurrent(generation) else { return }
                if handle(event) {
                    outcome = .completed
                    break
                }
            }
            guard isCurrent(generation), !Task.isCancelled else { return }
            if outcome == .endedEarly {
                // The connection closed without `complete`: a dropped stream.
                failStream(APIError.service(ServiceFailure(code: .interrupted, isRetryable: true, retryAfter: nil)))
            }
        } catch {
            guard isCurrent(generation), !Task.isCancelled else { return }
            failStream(error)
        }
    }

    private func isCurrent(_ generation: Int) -> Bool {
        activeStream?.generation == generation
    }

    /// Returns true when the event ends the stream successfully.
    private func handle(_ event: ChatStreamEvent) -> Bool {
        switch event.type {
        case .start:
            handleStart(userMessageId: event.userMessageId, assistantMessageId: event.assistantMessageId)
            return false
        case .token:
            if let content = event.content, !content.isEmpty {
                appendToken(content)
            }
            return false
        case .complete:
            completeStream(event)
            return true
        case .error:
            // APIClient throws error events via `failure`; never yielded.
            return false
        }
    }

    private func handleStart(userMessageId: String?, assistantMessageId: String?) {
        guard var stream = activeStream else { return }
        stream.didStart = true
        stream.assistantServerId = assistantMessageId
        activeStream = stream

        if case .send(_, _, let userRowId) = stream.request,
           let index = messages.firstIndex(where: { $0.id == userRowId }) {
            messages[index].serverId = userMessageId
            messages[index].status = .complete
            unsentClientIds[userRowId] = nil
        }
        if let index = messages.firstIndex(where: { $0.id == stream.replyRowId }) {
            messages[index].serverId = assistantMessageId
        }
    }

    private func completeStream(_ event: ChatStreamEvent) {
        guard var stream = activeStream else { return }
        if let assistantMessageId = event.assistantMessageId {
            stream.assistantServerId = assistantMessageId
        }
        flushTokens()
        let text = streamingText
        finishStream()
        streamTask = nil

        let status: ChatTranscriptStatus = event.status.map(ChatTranscriptStatus.init) ?? .complete
        settleReply(stream, text: text, status: status)

        if let update = event.conversation, var current = conversation, current.id == update.id {
            current.title = update.title ?? current.title
            current.updatedAt = ServerDate.parse(update.updatedAt) ?? Date()
            conversation = current
        } else if var current = conversation {
            current.updatedAt = Date()
            conversation = current
        }
        if let current = conversation {
            listSync?.conversationDidChange(summary(for: current, preview: text))
        }
        completionCount += 1
    }

    private func failStream(_ error: Error) {
        guard let stream = activeStream else { return }
        flushTokens()
        let text = streamingText
        finishStream()
        streamTask = nil

        if case APIError.subscriptionRequired = error {
            // The hard paywall takes over (APIClient flips the entitlement).
            rollBackForPaywall(stream, text: text)
            return
        }

        errorHandler.handleSilently(error, context: "chat.stream")
        failureCount += 1

        if !stream.didStart {
            handlePreStartFailure(stream, error: error)
        } else {
            settleReply(stream, text: text, status: .failed)
            let retry: ChatRetryAction? = Self.isRetryable(error)
                ? stream.assistantServerId.map { .regenerate(assistantMessageId: $0) } ?? .reload
                : nil
            presentBanner(for: error, retry: retry)
        }
    }

    private func handlePreStartFailure(_ stream: ActiveStream, error: Error) {
        switch stream.request {
        case .send(let content, _, let userRowId):
            removeRow(id: stream.replyRowId)
            if Self.isDuplicateMessage(error) {
                // An earlier attempt with this key reached the server.
                unsentClientIds[userRowId] = nil
                Task { await reloadConversation() }
                return
            }
            if Self.isRetryable(error) {
                setStatus(.notSent, forRow: userRowId)
                presentBanner(for: error, retry: .resend(rowId: userRowId))
            } else {
                // Non-retryable (blocked content, too long, fair-use): give the
                // text back so the user can edit it.
                removeRow(id: userRowId)
                unsentClientIds[userRowId] = nil
                if draft.isEmpty { draft = content }
                presentBanner(for: error, retry: nil)
            }
        case .regenerate(let assistantMessageId, let original):
            replaceRow(id: stream.replyRowId, with: original)
            if case APIError.notFound = error {
                Task { await reloadConversation() }
                return
            }
            presentBanner(
                for: error,
                retry: Self.isRetryable(error) ? .regenerate(assistantMessageId: assistantMessageId) : nil
            )
        }
    }

    private func rollBackForPaywall(_ stream: ActiveStream, text: String) {
        switch stream.request {
        case .send(let content, _, let userRowId):
            if stream.didStart {
                settleReply(stream, text: text, status: .failed)
            } else {
                removeRow(id: stream.replyRowId)
                removeRow(id: userRowId)
                unsentClientIds[userRowId] = nil
                if draft.isEmpty { draft = content }
            }
        case .regenerate(_, let original):
            if stream.didStart {
                settleReply(stream, text: text, status: .failed)
            } else {
                replaceRow(id: stream.replyRowId, with: original)
            }
        }
    }

    /// Writes the final text and status into the reply row, or removes the
    /// row when nothing was generated and it was not a failure worth showing.
    private func settleReply(_ stream: ActiveStream, text: String, status: ChatTranscriptStatus) {
        guard let index = messages.firstIndex(where: { $0.id == stream.replyRowId }) else { return }
        if text.isEmpty && status == .stopped {
            messages.remove(at: index)
            return
        }
        messages[index].content = text
        messages[index].status = status
        messages[index].serverId = stream.assistantServerId ?? messages[index].serverId
    }

    private func finishStream() {
        flushTask?.cancel()
        flushTask = nil
        tokenBuffer = ""
        activeStream = nil
        streamingMessageId = nil
        streamingText = ""
        phase = .idle
    }

    // MARK: - Token Throttling

    private func appendToken(_ token: String) {
        tokenBuffer += token
        if phase != .streaming { phase = .streaming }
        guard flushTask == nil else { return }
        flushTask = Task { [weak self] in
            try? await Task.sleep(for: Self.tokenFlushInterval)
            guard !Task.isCancelled else { return }
            self?.flushTokens()
        }
    }

    private func flushTokens() {
        flushTask?.cancel()
        flushTask = nil
        guard !tokenBuffer.isEmpty else { return }
        streamingText += tokenBuffer
        tokenBuffer = ""
    }

    // MARK: - Helpers

    private func ensureConversation() async throws -> String {
        if let id = conversation?.id { return id }
        let created = try await service.createConversation(title: pendingTitle, systemPrompt: pendingSystemPrompt)
        conversation = created
        lastRequestedConversationId = created.id
        pendingTitle = nil
        pendingSystemPrompt = nil
        loadState = .loaded
        listSync?.conversationDidChange(summary(for: created, preview: nil))
        return created.id
    }

    private func apply(_ detail: ChatConversationDetailResponse) {
        conversation = detail.conversation
        lastRequestedConversationId = detail.conversation.id
        messages = detail.messages.map(ChatTranscriptMessage.init)
        hasOlderMessages = detail.hasMore
        loadState = .loaded
        transcriptRevision += 1
    }

    private func applyConversationChange(_ updated: ChatConversation) {
        conversation = updated
        let preview = messages.last(where: { !$0.content.isEmpty })?.content
        listSync?.conversationDidChange(summary(for: updated, preview: preview))
    }

    private func summary(for conversation: ChatConversation, preview: String?) -> ChatConversationSummary {
        ChatConversationSummary(
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            lastMessagePreview: preview.map { String($0.prefix(Self.previewLength)) }
        )
    }

    private func presentBanner(for error: Error, retry: ChatRetryAction?) {
        let retryAfter: Date? = {
            guard case APIError.service(let failure) = error, let delay = failure.retryAfter, delay > 0 else {
                return nil
            }
            return Date().addingTimeInterval(min(delay, 60))
        }()
        banner = ChatErrorBanner(message: Self.userMessage(for: error), retry: retry, retryAvailableAt: retryAfter)
    }

    private func setStatus(_ status: ChatTranscriptStatus, forRow id: String) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].status = status
    }

    private func removeRow(id: String) {
        messages.removeAll { $0.id == id }
    }

    private func replaceRow(id: String, with message: ChatTranscriptMessage) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index] = message
    }

    private static func normalized(_ value: String, limit: Int) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(limit))
    }

    private static func isDuplicateMessage(_ error: Error) -> Bool {
        if case APIError.serverMessage(_, 409) = error { return true }
        return false
    }

    static func isRetryable(_ error: Error) -> Bool {
        if let apiError = error as? APIError {
            switch apiError {
            case .subscriptionRequired, .fairUseLimit, .badRequest, .notAuthenticated, .unauthorized,
                 .quotaExceeded, .featureLocked, .transactionOwnedByAnotherAccount:
                return false
            case .service(let failure):
                return failure.isRetryable
            case .requestTimedOut, .rateLimited, .serverError, .invalidResponse, .decodingError:
                return true
            case .notFound, .serverMessage, .httpError, .invalidURL, .secureStorageUnavailable:
                return false
            }
        }
        return ErrorHandler.shared.mapToAppError(error).isRetryable
    }

    /// Copy safe to show: never server or provider text for AI failures.
    static func userMessage(for error: Error) -> String {
        ErrorHandler.shared.mapToAppError(error).userMessage
    }
}
