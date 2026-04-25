//
//  ThreadViewModel.swift
//  Prompt
//
//  ViewModel for multi-turn conversation thread enhancement
//

import Foundation
import SwiftUI
import UIKit

@Observable
@MainActor
final class ThreadViewModel {
    // MARK: - State

    var threads: [ThreadRecord] = []
    var currentThread: ThreadDetailDTO?
    var turns: [ThreadTurnRecord] = []
    var userPrompt: String = ""
    var selectedImageAttachment: PromptImageAttachment?
    var pendingUserPrompt: String?
    var pendingImageAttachment: PromptImageAttachment?
    var isStreaming: Bool = false
    var streamingContent: String = ""
    var isLoadingThreads: Bool = false
    var isLoadingDetail: Bool = false
    var errorMessage: String?
    var showError: Bool = false
    var showPaywall: Bool = false
    var activeStreamResponseMode: ThreadConversationMode = .optimize

    // Pagination
    var currentPage = 1
    var totalPages = 1
    var hasMorePages: Bool { currentPage < totalPages }

    // MARK: - Computed

    /// Flatten turns into a list of user/assistant messages for the chat UI,
    /// including any partial streaming content as the last assistant message.
    var turnMessages: [ThreadMessage] {
        var messages: [ThreadMessage] = []
        for turn in turns {
            messages.append(ThreadMessage(
                id: "\(turn.id)-user",
                role: .user,
                content: turn.originalPrompt,
                responseMode: nil,
                imageAttachment: turn.imageAttachment,
                turnIndex: turn.turnIndex,
                tokens: nil
            ))
            messages.append(ThreadMessage(
                id: "\(turn.id)-assistant",
                role: .assistant,
                content: turn.enhancedPrompt,
                responseMode: turn.responseMode,
                imageAttachment: nil,
                turnIndex: turn.turnIndex,
                tokens: turn.totalTokens
            ))
        }
        if isStreaming, pendingUserPrompt != nil || pendingImageAttachment != nil {
            messages.append(ThreadMessage(
                id: "pending-user",
                role: .user,
                content: pendingUserPrompt ?? "",
                responseMode: nil,
                imageAttachment: pendingImageAttachment,
                turnIndex: turns.count,
                tokens: nil
            ))
        }
        // Append streaming partial if active
        if isStreaming && !streamingContent.isEmpty {
            messages.append(ThreadMessage(
                id: "streaming",
                role: .assistant,
                content: streamingContent,
                responseMode: activeStreamResponseMode,
                imageAttachment: nil,
                turnIndex: turns.count,
                tokens: nil
            ))
        }
        return messages
    }

    var canSend: Bool {
        (!userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || selectedImageAttachment != nil) && !isStreaming
    }

    var threadTitle: String {
        currentThread?.title ?? "New Thread"
    }

    var latestEnhancedPrompt: String? {
        guard let lastTurn = turns.last, lastTurn.responseMode == .optimize else {
            return nil
        }

        return lastTurn.enhancedPrompt
    }

    var hasConversation: Bool {
        !turns.isEmpty || isStreaming
    }

    // MARK: - Private

    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    private let guestSession = GuestSessionManager.shared

    // MARK: - Init

    init() {
        ThreadSyncBroadcaster.shared.register(self)
    }

    // MARK: - Cross-instance sync

    /// Applies a thread upsert that originated from another ThreadViewModel instance.
    /// Called by ThreadSyncBroadcaster so every ViewModel (home, sidebar, history) stays in sync.
    func applyRemoteThreadUpsert(_ thread: ThreadRecord) {
        threads.removeAll { $0.id == thread.id }
        threads.insert(thread, at: 0)

        if let current = currentThread, current.id == thread.id {
            currentThread = ThreadDetailDTO(
                id: current.id,
                title: thread.title,
                modality: thread.modality,
                isArchived: thread.isArchived,
                createdAt: current.createdAt,
                updatedAt: ISO8601DateFormatter().string(from: thread.updatedAt),
                turns: current.turns
            )
        }
    }

    /// Applies a thread deletion that originated from another ThreadViewModel instance.
    func applyRemoteThreadDeletion(id: String) {
        threads.removeAll { $0.id == id }
        if currentThread?.id == id {
            currentThread = nil
            turns = []
            pendingUserPrompt = nil
            pendingImageAttachment = nil
            streamingContent = ""
            isStreaming = false
        }
    }

    // MARK: - Thread CRUD

    func fetchThreads(refresh: Bool = false) async {
        guard await APIClient.shared.isAuthenticated else {
            threads = []
            totalPages = 1
            isLoadingThreads = false
            return
        }

        if refresh { currentPage = 1 }
        isLoadingThreads = true

        do {
            let response: ThreadListResponse = try await APIClient.shared.request(
                "/threads?page=\(currentPage)&limit=20",
                method: .get
            )
            if refresh || currentPage == 1 {
                threads = response.threads.map { ThreadRecord(from: $0) }
            } else {
                threads.append(contentsOf: response.threads.map { ThreadRecord(from: $0) })
            }
            totalPages = response.pagination.totalPages
        } catch let error as APIError {
            errorMessage = error.localizedDescription
            showError = true
        } catch {
            errorMessage = "Failed to load threads"
            showError = true
        }

        isLoadingThreads = false
    }

    func loadThread(id: String) async {
        guard await APIClient.shared.isAuthenticated else {
            currentThread = nil
            turns = []
            isLoadingDetail = false
            return
        }

        isLoadingDetail = true

        do {
            let response: ThreadDetailResponse = try await APIClient.shared.request(
                "/threads/\(id)",
                method: .get
            )
            currentThread = response.thread
            turns = response.thread.turns.map { ThreadTurnRecord(from: $0) }
        } catch let error as APIError {
            currentThread = nil
            turns = []
            errorMessage = error.localizedDescription
            showError = true
        } catch {
            currentThread = nil
            turns = []
            errorMessage = "Failed to load thread"
            showError = true
        }

        isLoadingDetail = false
    }

    func deleteThread(id: String) async {
        guard await APIClient.shared.isAuthenticated else {
            threads.removeAll { $0.id == id }
            if currentThread?.id == id {
                resetThread()
            }
            ThreadSyncBroadcaster.shared.broadcastDeletion(id: id, from: self)
            return
        }

        do {
            try await APIClient.shared.requestVoid(
                "/threads/\(id)",
                method: .delete
            )
            threads.removeAll { $0.id == id }
            if currentThread?.id == id {
                currentThread = nil
                turns = []
                pendingUserPrompt = nil
            }
            ThreadSyncBroadcaster.shared.broadcastDeletion(id: id, from: self)
        } catch {
            errorMessage = "Failed to delete thread"
            showError = true
        }
    }

    func updateThreadTitle(_ title: String) async {
        guard let threadId = currentThread?.id else { return }
        guard await APIClient.shared.isAuthenticated else { return }

        do {
            let body = UpdateThreadRequest(
                title: title,
                isArchived: nil
            )
            let _: ThreadUpdateResponse = try await APIClient.shared.request(
                "/threads/\(threadId)",
                method: .patch,
                body: body
            )
            if let thread = currentThread {
                currentThread = ThreadDetailDTO(
                    id: thread.id,
                    title: title,
                    modality: thread.modality,
                    isArchived: thread.isArchived,
                    createdAt: thread.createdAt,
                    updatedAt: thread.updatedAt,
                    turns: thread.turns
                )
            }
            syncLocalThreadListAfterChange(
                id: threadId,
                fallbackTitle: title,
                fallbackModality: currentThread?.modality ?? "text",
                now: Date()
            )
        } catch {
            errorMessage = "Failed to update title"
            showError = true
        }
    }

    // MARK: - Create Thread (First Turn)

    func startNewThread(
        settings: SettingsManager,
        historyManager: PromptHistoryManager? = nil,
        initialPrompt: String? = nil,
        initialAttachment: PromptImageAttachment? = nil
    ) async {
        let promptToSend = (initialPrompt ?? userPrompt).trimmingCharacters(in: .whitespacesAndNewlines)
        let sentAttachment = initialAttachment ?? selectedImageAttachment
        guard !promptToSend.isEmpty || sentAttachment != nil else { return }
        let isAuthenticated = await APIClient.shared.isAuthenticated

        if !isAuthenticated {
            switch guestSession.submissionDecision(for: settings.promptMode) {
            case .allowed:
                break
            case .blocked(let message), .requiresAuthentication(let message):
                errorMessage = message
                showError = true
                return
            }
        }

        beginSubmission(
            prompt: promptToSend,
            attachment: sentAttachment,
            responseMode: settings.conversationMode
        )
        defer {
            finishSubmission()
        }

        let request = CreateThreadRequest(
            prompt: promptToSend,
            title: nil,
            modality: settings.effectiveApiModality,
            subModality: settings.effectiveSubModality,
            mode: settings.promptMode.rawValue,
            conversationMode: settings.conversationMode.rawValue,
            imageAttachment: sentAttachment,
            previousTurns: seededTurnsForRequest
        )

        let sentPrompt = promptToSend
        let responseMode = settings.conversationMode

        let stream = await streamForNewConversation(
            request: request,
            prompt: sentPrompt,
            settings: settings
        )

        var didReceiveCompletion = false

        do {
            for try await event in stream {
                guestSession.synchronize(with: event.guestQuota)

                switch event.type {
                case .token:
                    if let content = event.content {
                        streamingContent += content
                    }
                case .complete:
                    didReceiveCompletion = true
                    let completedThreadId = event.threadId
                    let turnRecord = appendTurnRecord(
                        id: event.turnId ?? UUID().uuidString,
                        turnIndex: event.turnIndex ?? turns.count,
                        originalPrompt: sentPrompt,
                        enhancedPrompt: resolvedStreamedResponse(fallback: event.content),
                        responseMode: responseMode,
                        imageAttachment: event.imageAttachment ?? sentAttachment,
                        model: settings.effectiveModel.rawValue,
                        totalTokens: event.usage?.totalTokens ?? 0,
                        processingMs: event.usage?.processingMs ?? 0
                    )

                    if isAuthenticated, let completedThreadId {
                        upsertCurrentThread(
                            id: completedThreadId,
                            title: derivedThreadTitle(prompt: sentPrompt, attachment: sentAttachment),
                            modality: settings.effectiveApiModality
                        )
                    }

                    clearPendingSubmission()
                    await persistTurnToHistory(
                        turnRecord,
                        originalPrompt: sentPrompt,
                        modality: settings.effectiveApiModality,
                        settings: settings,
                        historyManager: historyManager
                    )
                case .error:
                    didReceiveCompletion = true
                    if event.guestQuota?.isExhausted == true {
                        guestSession.presentAuthenticationGate()
                    }
                    restoreComposer(prompt: sentPrompt, attachment: sentAttachment)
                    presentError(event.message ?? failureMessage(for: responseMode))
                }
            }

            if !didReceiveCompletion {
                await recoverIncompleteStream(
                    prompt: sentPrompt,
                    attachment: sentAttachment,
                    modality: settings.effectiveApiModality,
                    settings: settings,
                    historyManager: historyManager,
                    responseMode: responseMode
                )
            }
        } catch let error as APIError {
            if error.isQuotaExceeded {
                restoreComposer(prompt: sentPrompt, attachment: sentAttachment)
                showPaywall = true
            } else {
                await recoverInterruptedStream(
                    prompt: sentPrompt,
                    attachment: sentAttachment,
                    modality: settings.effectiveApiModality,
                    settings: settings,
                    historyManager: historyManager,
                    responseMode: responseMode,
                    message: error.localizedDescription
                )
            }
        } catch {
            await recoverInterruptedStream(
                prompt: sentPrompt,
                attachment: sentAttachment,
                modality: settings.effectiveApiModality,
                settings: settings,
                historyManager: historyManager,
                responseMode: responseMode,
                message: "Stream connection failed"
            )
        }
    }

    // MARK: - Add Turn to Existing Thread

    func addTurn(settings: SettingsManager, historyManager: PromptHistoryManager? = nil) async {
        guard let threadId = currentThread?.id else {
            await startNewThread(settings: settings, historyManager: historyManager)
            return
        }
        let sentPrompt = userPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let sentAttachment = selectedImageAttachment
        guard !sentPrompt.isEmpty || sentAttachment != nil else { return }
        let isAuthenticated = await APIClient.shared.isAuthenticated

        if !isAuthenticated {
            await startNewThread(settings: settings, historyManager: historyManager)
            return
        }

        beginSubmission(
            prompt: sentPrompt,
            attachment: sentAttachment,
            responseMode: settings.conversationMode
        )
        defer {
            finishSubmission()
        }

        let request = AddTurnRequest(
            prompt: sentPrompt,
            subModality: settings.effectiveSubModality,
            mode: settings.promptMode.rawValue,
            conversationMode: settings.conversationMode.rawValue,
            imageAttachment: sentAttachment
        )
        let responseMode = settings.conversationMode

        let stream = await APIClient.shared.requestStream(
            "/threads/\(threadId)/turns/stream",
            method: .post,
            body: request
        )

        var didReceiveCompletion = false

        do {
            for try await event in stream {
                guestSession.synchronize(with: event.guestQuota)

                switch event.type {
                case .token:
                    if let content = event.content {
                        streamingContent += content
                    }
                case .complete:
                    didReceiveCompletion = true
                    let turnRecord = appendTurnRecord(
                        id: event.turnId ?? UUID().uuidString,
                        turnIndex: event.turnIndex ?? turns.count,
                        originalPrompt: sentPrompt,
                        enhancedPrompt: resolvedStreamedResponse(fallback: event.content),
                        responseMode: responseMode,
                        imageAttachment: event.imageAttachment ?? sentAttachment,
                        model: settings.effectiveModel.rawValue,
                        totalTokens: event.usage?.totalTokens ?? 0,
                        processingMs: event.usage?.processingMs ?? 0
                    )
                    clearPendingSubmission()
                    syncLocalThreadListAfterChange(
                        id: threadId,
                        fallbackTitle: currentThread?.title ?? derivedThreadTitle(prompt: sentPrompt, attachment: sentAttachment),
                        fallbackModality: currentThread?.modality ?? settings.effectiveApiModality,
                        now: Date()
                    )
                    await persistTurnToHistory(
                        turnRecord,
                        originalPrompt: sentPrompt,
                        modality: currentThread?.modality ?? settings.effectiveApiModality,
                        settings: settings,
                        historyManager: historyManager
                    )
                case .error:
                    didReceiveCompletion = true
                    if event.guestQuota?.isExhausted == true {
                        guestSession.presentAuthenticationGate()
                    }
                    restoreComposer(prompt: sentPrompt, attachment: sentAttachment)
                    presentError(event.message ?? failureMessage(for: responseMode))
                }
            }

            if !didReceiveCompletion {
                await recoverIncompleteStream(
                    prompt: sentPrompt,
                    attachment: sentAttachment,
                    modality: currentThread?.modality ?? settings.effectiveApiModality,
                    settings: settings,
                    historyManager: historyManager,
                    responseMode: responseMode
                )
            }
        } catch let error as APIError {
            if case .notFound = error {
                currentThread = nil
                turns = []
                clearPendingSubmission()
                finishSubmission()
                await startNewThread(
                    settings: settings,
                    historyManager: historyManager,
                    initialPrompt: sentPrompt,
                    initialAttachment: sentAttachment
                )
                return
            }

            if error.isQuotaExceeded {
                restoreComposer(prompt: sentPrompt, attachment: sentAttachment)
                showPaywall = true
            } else {
                await recoverInterruptedStream(
                    prompt: sentPrompt,
                    attachment: sentAttachment,
                    modality: currentThread?.modality ?? settings.effectiveApiModality,
                    settings: settings,
                    historyManager: historyManager,
                    responseMode: responseMode,
                    message: error.localizedDescription
                )
            }
        } catch {
            await recoverInterruptedStream(
                prompt: sentPrompt,
                attachment: sentAttachment,
                modality: currentThread?.modality ?? settings.effectiveApiModality,
                settings: settings,
                historyManager: historyManager,
                responseMode: responseMode,
                message: "Stream connection failed"
            )
        }
    }

    // MARK: - Reset

    func resetThread() {
        currentThread = nil
        turns = []
        userPrompt = ""
        selectedImageAttachment = nil
        pendingUserPrompt = nil
        pendingImageAttachment = nil
        streamingContent = ""
        isStreaming = false
        activeStreamResponseMode = .optimize
    }

    // MARK: - Background Task

    private func beginBackgroundTask() {
        endBackgroundTask()
        backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "ThreadEnhancement") { [weak self] in
            Task { @MainActor in
                self?.endBackgroundTask()
            }
        }
    }

    private func endBackgroundTask() {
        guard backgroundTaskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskId)
        backgroundTaskId = .invalid
    }

    private func beginSubmission(
        prompt: String,
        attachment: PromptImageAttachment?,
        responseMode: ThreadConversationMode
    ) {
        activeStreamResponseMode = responseMode
        isStreaming = true
        streamingContent = ""
        pendingUserPrompt = prompt
        pendingImageAttachment = attachment
        userPrompt = ""
        selectedImageAttachment = nil
        beginBackgroundTask()
    }

    private func finishSubmission() {
        isStreaming = false
        endBackgroundTask()
    }

    private func clearPendingSubmission() {
        pendingUserPrompt = nil
        pendingImageAttachment = nil
        streamingContent = ""
    }

    private func restoreComposer(prompt: String, attachment: PromptImageAttachment?) {
        userPrompt = prompt
        selectedImageAttachment = attachment
        clearPendingSubmission()
    }

    private func resolvedStreamedResponse(fallback: String?) -> String {
        let fallbackTrimmed = fallback?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !fallbackTrimmed.isEmpty {
            return fallbackTrimmed
        }

        return streamingContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func appendTurnRecord(
        id: String,
        turnIndex: Int,
        originalPrompt: String,
        enhancedPrompt: String,
        responseMode: ThreadConversationMode,
        imageAttachment: PromptImageAttachment?,
        model: String,
        totalTokens: Int,
        processingMs: Int
    ) -> ThreadTurnRecord {
        let turnRecord = ThreadTurnRecord(
            id: id,
            turnIndex: turnIndex,
            originalPrompt: originalPrompt,
            enhancedPrompt: enhancedPrompt,
            responseMode: responseMode,
            imageAttachment: imageAttachment,
            model: model,
            totalTokens: totalTokens,
            processingMs: processingMs,
            createdAt: Date()
        )
        turns.append(turnRecord)
        return turnRecord
    }

    private func persistTurnToHistory(
        _ turnRecord: ThreadTurnRecord,
        originalPrompt: String,
        modality: String,
        settings: SettingsManager,
        historyManager: PromptHistoryManager?
    ) async {
        _ = await historyManager?.savePrompt(
            original: originalPrompt,
            enhanced: turnRecord.enhancedPrompt,
            model: turnRecord.model,
            modality: modality,
            imageAttachment: turnRecord.imageAttachment,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: turnRecord.totalTokens,
            processingMs: turnRecord.processingMs
        )
    }

    private func recoverIncompleteStream(
        prompt: String,
        attachment: PromptImageAttachment?,
        modality: String,
        settings: SettingsManager,
        historyManager: PromptHistoryManager?,
        responseMode: ThreadConversationMode
    ) async {
        let recoveredContent = resolvedStreamedResponse(fallback: nil)
        guard !recoveredContent.isEmpty else {
            restoreComposer(prompt: prompt, attachment: attachment)
            presentError("The response ended unexpectedly. Please try again.")
            return
        }

        let recoveredTurn = appendTurnRecord(
            id: UUID().uuidString,
            turnIndex: turns.count,
            originalPrompt: prompt,
            enhancedPrompt: recoveredContent,
            responseMode: responseMode,
            imageAttachment: attachment,
            model: settings.effectiveModel.rawValue,
            totalTokens: 0,
            processingMs: 0
        )
        clearPendingSubmission()
        if let threadId = currentThread?.id {
            syncLocalThreadListAfterChange(
                id: threadId,
                fallbackTitle: currentThread?.title ?? derivedThreadTitle(prompt: prompt, attachment: attachment),
                fallbackModality: currentThread?.modality ?? modality,
                now: Date()
            )
        }
        await persistTurnToHistory(
            recoveredTurn,
            originalPrompt: prompt,
            modality: modality,
            settings: settings,
            historyManager: historyManager
        )
        presentError("The reply was kept locally because the stream closed before the server confirmed the turn.")
    }

    private func recoverInterruptedStream(
        prompt: String,
        attachment: PromptImageAttachment?,
        modality: String,
        settings: SettingsManager,
        historyManager: PromptHistoryManager?,
        responseMode: ThreadConversationMode,
        message: String
    ) async {
        let recoveredContent = resolvedStreamedResponse(fallback: nil)
        guard !recoveredContent.isEmpty else {
            restoreComposer(prompt: prompt, attachment: attachment)
            presentError(message)
            return
        }

        let recoveredTurn = appendTurnRecord(
            id: UUID().uuidString,
            turnIndex: turns.count,
            originalPrompt: prompt,
            enhancedPrompt: recoveredContent,
            responseMode: responseMode,
            imageAttachment: attachment,
            model: settings.effectiveModel.rawValue,
            totalTokens: 0,
            processingMs: 0
        )
        clearPendingSubmission()
        if let threadId = currentThread?.id {
            syncLocalThreadListAfterChange(
                id: threadId,
                fallbackTitle: currentThread?.title ?? derivedThreadTitle(prompt: prompt, attachment: attachment),
                fallbackModality: currentThread?.modality ?? modality,
                now: Date()
            )
        }
        await persistTurnToHistory(
            recoveredTurn,
            originalPrompt: prompt,
            modality: modality,
            settings: settings,
            historyManager: historyManager
        )
        presentError("The connection dropped after a partial reply. The last turn was kept locally.")
    }

    private func presentError(_ message: String) {
        errorMessage = message
        showError = true
    }

    private func failureMessage(for responseMode: ThreadConversationMode) -> String {
        switch responseMode {
        case .optimize:
            return "Optimization failed"
        case .chat:
            return "Reply failed"
        }
    }

    private func derivedThreadTitle(prompt: String, attachment: PromptImageAttachment?) -> String {
        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedPrompt.isEmpty {
            return trimmedPrompt.count > 80 ? String(trimmedPrompt.prefix(80)) + "..." : trimmedPrompt
        }

        if attachment != nil {
            return "Image Conversation"
        }

        return "New Thread"
    }

    private func upsertCurrentThread(id: String, title: String, modality: String) {
        let now = Date()
        let timestamp = ISO8601DateFormatter().string(from: now)

        if let thread = currentThread, thread.id == id {
            currentThread = ThreadDetailDTO(
                id: thread.id,
                title: thread.title ?? title,
                modality: thread.modality,
                isArchived: thread.isArchived,
                createdAt: thread.createdAt,
                updatedAt: timestamp,
                turns: thread.turns
            )
        } else {
            currentThread = ThreadDetailDTO(
                id: id,
                title: title,
                modality: modality,
                isArchived: false,
                createdAt: timestamp,
                updatedAt: timestamp,
                turns: []
            )
        }

        syncLocalThreadListAfterChange(id: id, fallbackTitle: title, fallbackModality: modality, now: now)
    }

    /// Updates the in-memory `threads` list and broadcasts the change so other
    /// ThreadViewModel instances (sidebar, history, etc.) stay in sync without
    /// waiting for a network refresh.
    ///
    /// Call this any time a thread is created or a turn is added/updated.
    private func syncLocalThreadListAfterChange(id: String, fallbackTitle: String, fallbackModality: String, now: Date) {
        let existing = threads.first(where: { $0.id == id })

        let createdAt: Date = existing?.createdAt
            ?? currentThread.flatMap { ISO8601DateFormatter().date(from: $0.createdAt) }
            ?? now

        let resolvedTitle: String = {
            if let title = currentThread?.title, !title.isEmpty { return title }
            if let title = existing?.title, !title.isEmpty { return title }
            return fallbackTitle
        }()

        let resolvedModality: String = currentThread?.modality ?? existing?.modality ?? fallbackModality
        let resolvedIsArchived: Bool = currentThread?.isArchived ?? existing?.isArchived ?? false
        let resolvedTurnCount: Int = turns.count > 0 ? turns.count : (existing?.turnCount ?? 0)
        let resolvedPreview: String? = {
            if let lastEnhanced = turns.last?.enhancedPrompt, !lastEnhanced.isEmpty {
                return String(lastEnhanced.prefix(120))
            }
            return existing?.lastPreview
        }()

        let record = ThreadRecord(
            id: id,
            title: resolvedTitle,
            modality: resolvedModality,
            isArchived: resolvedIsArchived,
            turnCount: resolvedTurnCount,
            lastPreview: resolvedPreview,
            createdAt: createdAt,
            updatedAt: now
        )

        threads.removeAll { $0.id == id }
        threads.insert(record, at: 0)

        ThreadSyncBroadcaster.shared.broadcastUpsert(record, from: self)
    }

    private var seededTurnsForRequest: [SeedThreadTurnRequest]? {
        guard !turns.isEmpty else { return nil }

        return turns.map { turn in
            SeedThreadTurnRequest(
                originalPrompt: turn.originalPrompt,
                enhancedPrompt: turn.enhancedPrompt,
                imageAttachment: turn.imageAttachment,
                model: turn.model,
                totalTokens: turn.totalTokens,
                processingMs: turn.processingMs
            )
        }
    }

    private func streamForNewConversation(
        request: CreateThreadRequest,
        prompt: String,
        settings: SettingsManager
    ) async -> AsyncThrowingStream<StreamEvent, Error> {
        if await APIClient.shared.isAuthenticated {
            return await APIClient.shared.requestStream(
                "/threads",
                method: .post,
                body: request
            )
        }

        let guestRequest = GuestEnhanceRequest(
            prompt: prompt,
            modality: settings.effectiveApiModality,
            subModality: settings.effectiveSubModality,
            mode: settings.promptMode.rawValue,
            conversationMode: settings.conversationMode.rawValue,
            imageAttachment: request.imageAttachment,
            previousTurns: seededTurnsForRequest ?? []
        )

        return await APIClient.shared.requestStream(
            "/prompts/guest/enhance/stream",
            method: .post,
            body: guestRequest,
            requiresAuth: false
        )
    }
}

// MARK: - ThreadTurnRecord Convenience Init

extension ThreadTurnRecord {
    init(id: String, turnIndex: Int, originalPrompt: String, enhancedPrompt: String, responseMode: ThreadConversationMode = .optimize, imageAttachment: PromptImageAttachment?, model: String, totalTokens: Int, processingMs: Int, createdAt: Date) {
        self.id = id
        self.turnIndex = turnIndex
        self.originalPrompt = originalPrompt
        self.enhancedPrompt = enhancedPrompt
        self.responseMode = responseMode
        self.imageAttachment = imageAttachment
        self.model = model
        self.totalTokens = totalTokens
        self.processingMs = processingMs
        self.createdAt = createdAt
    }
}
