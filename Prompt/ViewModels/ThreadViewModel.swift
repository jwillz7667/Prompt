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
                imageAttachment: turn.imageAttachment,
                turnIndex: turn.turnIndex,
                tokens: nil
            ))
            messages.append(ThreadMessage(
                id: "\(turn.id)-assistant",
                role: .assistant,
                content: turn.enhancedPrompt,
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
        turns.last?.enhancedPrompt
    }

    var hasConversation: Bool {
        !turns.isEmpty || isStreaming
    }

    // MARK: - Private

    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    private let guestSession = GuestSessionManager.shared

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
        } catch {
            errorMessage = "Failed to update title"
            showError = true
        }
    }

    // MARK: - Create Thread (First Turn)

    func startNewThread(
        settings: SettingsManager,
        historyManager: PromptHistoryManager? = nil,
        initialPrompt: String? = nil
    ) async {
        let promptToSend = (initialPrompt ?? userPrompt).trimmingCharacters(in: .whitespacesAndNewlines)
        let sentAttachment = selectedImageAttachment
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

        isStreaming = true
        streamingContent = ""
        beginBackgroundTask()
        defer {
            isStreaming = false
            endBackgroundTask()
        }

        let request = CreateThreadRequest(
            prompt: promptToSend,
            title: nil,
            modality: settings.selectedModality.apiModality,
            subModality: settings.effectiveSubModality,
            mode: settings.promptMode.rawValue,
            customInstructions: sanitizedCustomInstructions(from: settings),
            imageAttachment: sentAttachment,
            previousTurns: seededTurnsForRequest
        )

        let sentPrompt = promptToSend
        pendingUserPrompt = sentPrompt
        pendingImageAttachment = sentAttachment
        userPrompt = ""
        selectedImageAttachment = nil

        let stream = await streamForNewConversation(
            request: request,
            prompt: sentPrompt,
            settings: settings
        )

        do {
            for try await event in stream {
                guestSession.synchronize(with: event.guestQuota)

                switch event.type {
                case .token:
                    if let content = event.content {
                        streamingContent += content
                    }
                case .complete:
                    let completedThreadId = event.threadId
                    let turnIndex = event.turnIndex ?? turns.count

                    // Create local turn record from streamed content
                    let turnRecord = ThreadTurnRecord(
                        id: event.turnId ?? UUID().uuidString,
                        turnIndex: turnIndex,
                        originalPrompt: sentPrompt,
                        enhancedPrompt: streamingContent,
                        imageAttachment: event.imageAttachment ?? sentAttachment,
                        model: settings.effectiveModel.rawValue,
                        totalTokens: event.usage?.totalTokens ?? 0,
                        processingMs: event.usage?.processingMs ?? 0,
                        createdAt: Date()
                    )
                    turns.append(turnRecord)
                    streamingContent = ""

                    // Save to prompt history
                    _ = await historyManager?.savePrompt(
                        original: sentPrompt,
                        enhanced: turnRecord.enhancedPrompt,
                        model: turnRecord.model,
                        modality: settings.selectedModality.apiModality,
                        imageAttachment: turnRecord.imageAttachment,
                        temperature: settings.temperature,
                        maxTokens: settings.maxTokens,
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: turnRecord.totalTokens,
                        processingMs: turnRecord.processingMs
                    )

                    // Load the full thread detail
                    if isAuthenticated, let completedThreadId = completedThreadId {
                        await loadThread(id: completedThreadId)
                    }
                    pendingUserPrompt = nil
                    pendingImageAttachment = nil
                case .error:
                    if event.guestQuota?.isExhausted == true {
                        guestSession.presentAuthenticationGate()
                    }
                    errorMessage = event.message ?? "Enhancement failed"
                    showError = true
                    userPrompt = sentPrompt
                    selectedImageAttachment = sentAttachment
                    pendingUserPrompt = nil
                    pendingImageAttachment = nil
                    streamingContent = ""
                }
            }
        } catch let error as APIError {
            if error.isQuotaExceeded {
                showPaywall = true
            } else {
                errorMessage = error.localizedDescription
                showError = true
            }
            userPrompt = sentPrompt
            selectedImageAttachment = sentAttachment
            pendingUserPrompt = nil
            pendingImageAttachment = nil
            streamingContent = ""
        } catch {
            errorMessage = "Stream connection failed"
            showError = true
            userPrompt = sentPrompt
            selectedImageAttachment = sentAttachment
            pendingUserPrompt = nil
            pendingImageAttachment = nil
            streamingContent = ""
        }
    }

    // MARK: - Add Turn to Existing Thread

    func addTurn(settings: SettingsManager, historyManager: PromptHistoryManager? = nil) async {
        guard let threadId = currentThread?.id else {
            await startNewThread(settings: settings, historyManager: historyManager)
            return
        }
        let sentAttachment = selectedImageAttachment
        guard !userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sentAttachment != nil else { return }
        let isAuthenticated = await APIClient.shared.isAuthenticated

        if !isAuthenticated {
            await startNewThread(settings: settings, historyManager: historyManager)
            return
        }

        isStreaming = true
        streamingContent = ""
        beginBackgroundTask()
        defer {
            isStreaming = false
            endBackgroundTask()
        }

        let request = AddTurnRequest(
            prompt: userPrompt,
            subModality: settings.effectiveSubModality,
            mode: settings.promptMode.rawValue,
            customInstructions: sanitizedCustomInstructions(from: settings),
            imageAttachment: sentAttachment
        )

        let sentPrompt = userPrompt
        pendingUserPrompt = sentPrompt
        pendingImageAttachment = sentAttachment
        userPrompt = ""
        selectedImageAttachment = nil

        let stream = await APIClient.shared.requestStream(
            "/threads/\(threadId)/turns/stream",
            method: .post,
            body: request
        )

        do {
            for try await event in stream {
                guestSession.synchronize(with: event.guestQuota)

                switch event.type {
                case .token:
                    if let content = event.content {
                        streamingContent += content
                    }
                case .complete:
                    let turnIndex = event.turnIndex ?? turns.count

                    let turnRecord = ThreadTurnRecord(
                        id: event.turnId ?? UUID().uuidString,
                        turnIndex: turnIndex,
                        originalPrompt: sentPrompt,
                        enhancedPrompt: streamingContent,
                        imageAttachment: event.imageAttachment ?? sentAttachment,
                        model: settings.effectiveModel.rawValue,
                        totalTokens: event.usage?.totalTokens ?? 0,
                        processingMs: event.usage?.processingMs ?? 0,
                        createdAt: Date()
                    )
                    turns.append(turnRecord)
                    streamingContent = ""

                    // Save to prompt history
                    _ = await historyManager?.savePrompt(
                        original: sentPrompt,
                        enhanced: turnRecord.enhancedPrompt,
                        model: turnRecord.model,
                        modality: currentThread?.modality ?? settings.selectedModality.apiModality,
                        imageAttachment: turnRecord.imageAttachment,
                        temperature: settings.temperature,
                        maxTokens: settings.maxTokens,
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: turnRecord.totalTokens,
                        processingMs: turnRecord.processingMs
                    )
                    pendingUserPrompt = nil
                    pendingImageAttachment = nil
                case .error:
                    if event.guestQuota?.isExhausted == true {
                        guestSession.presentAuthenticationGate()
                    }
                    errorMessage = event.message ?? "Enhancement failed"
                    showError = true
                    userPrompt = sentPrompt
                    selectedImageAttachment = sentAttachment
                    pendingUserPrompt = nil
                    pendingImageAttachment = nil
                    streamingContent = ""
                }
            }
        } catch let error as APIError {
            if case .notFound = error {
                currentThread = nil
                turns = []
                pendingUserPrompt = nil
                pendingImageAttachment = nil
                streamingContent = ""
                isStreaming = false
                endBackgroundTask()
                await startNewThread(
                    settings: settings,
                    historyManager: historyManager,
                    initialPrompt: sentPrompt
                )
                return
            }

            if error.isQuotaExceeded {
                showPaywall = true
            } else {
                errorMessage = error.localizedDescription
                showError = true
            }
            userPrompt = sentPrompt
            selectedImageAttachment = sentAttachment
            pendingUserPrompt = nil
            pendingImageAttachment = nil
            streamingContent = ""
        } catch {
            errorMessage = "Stream connection failed"
            showError = true
            userPrompt = sentPrompt
            selectedImageAttachment = sentAttachment
            pendingUserPrompt = nil
            pendingImageAttachment = nil
            streamingContent = ""
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

    private func sanitizedCustomInstructions(from settings: SettingsManager) -> String? {
        let trimmed = settings.customInstructions.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(2_000))
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
            modality: settings.selectedModality.apiModality,
            subModality: settings.effectiveSubModality,
            mode: settings.promptMode.rawValue,
            customInstructions: sanitizedCustomInstructions(from: settings),
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
    init(id: String, turnIndex: Int, originalPrompt: String, enhancedPrompt: String, imageAttachment: PromptImageAttachment?, model: String, totalTokens: Int, processingMs: Int, createdAt: Date) {
        self.id = id
        self.turnIndex = turnIndex
        self.originalPrompt = originalPrompt
        self.enhancedPrompt = enhancedPrompt
        self.imageAttachment = imageAttachment
        self.model = model
        self.totalTokens = totalTokens
        self.processingMs = processingMs
        self.createdAt = createdAt
    }
}
