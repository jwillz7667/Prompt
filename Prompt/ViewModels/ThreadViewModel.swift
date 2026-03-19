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
    var pendingUserPrompt: String?
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
                turnIndex: turn.turnIndex,
                tokens: nil
            ))
            messages.append(ThreadMessage(
                id: "\(turn.id)-assistant",
                role: .assistant,
                content: turn.enhancedPrompt,
                turnIndex: turn.turnIndex,
                tokens: turn.totalTokens
            ))
        }
        if let pendingUserPrompt, isStreaming {
            messages.append(ThreadMessage(
                id: "pending-user",
                role: .user,
                content: pendingUserPrompt,
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
                turnIndex: turns.count,
                tokens: nil
            ))
        }
        return messages
    }

    var canSend: Bool {
        !userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isStreaming
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

    // MARK: - Thread CRUD

    func fetchThreads(refresh: Bool = false) async {
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
        guard !promptToSend.isEmpty else { return }
        guard await APIClient.shared.isAuthenticated else {
            errorMessage = "Please sign in to continue"
            showError = true
            return
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
            customInstructions: sanitizedCustomInstructions(from: settings)
        )

        let sentPrompt = promptToSend
        pendingUserPrompt = sentPrompt
        userPrompt = ""

        let stream = await APIClient.shared.requestStream(
            "/threads",
            method: .post,
            body: request
        )

        do {
            for try await event in stream {
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
                        temperature: 0,
                        maxTokens: 0,
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: turnRecord.totalTokens,
                        processingMs: turnRecord.processingMs
                    )

                    // Load the full thread detail
                    if let completedThreadId = completedThreadId {
                        await loadThread(id: completedThreadId)
                    }
                    pendingUserPrompt = nil
                case .error:
                    errorMessage = event.message ?? "Enhancement failed"
                    showError = true
                    userPrompt = sentPrompt
                    pendingUserPrompt = nil
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
            pendingUserPrompt = nil
            streamingContent = ""
        } catch {
            errorMessage = "Stream connection failed"
            showError = true
            userPrompt = sentPrompt
            pendingUserPrompt = nil
            streamingContent = ""
        }
    }

    // MARK: - Add Turn to Existing Thread

    func addTurn(settings: SettingsManager, historyManager: PromptHistoryManager? = nil) async {
        guard let threadId = currentThread?.id else {
            await startNewThread(settings: settings, historyManager: historyManager)
            return
        }
        guard !userPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard await APIClient.shared.isAuthenticated else {
            errorMessage = "Please sign in to continue"
            showError = true
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
            customInstructions: sanitizedCustomInstructions(from: settings)
        )

        let sentPrompt = userPrompt
        pendingUserPrompt = sentPrompt
        userPrompt = ""

        let stream = await APIClient.shared.requestStream(
            "/threads/\(threadId)/turns/stream",
            method: .post,
            body: request
        )

        do {
            for try await event in stream {
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
                        temperature: 0,
                        maxTokens: 0,
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: turnRecord.totalTokens,
                        processingMs: turnRecord.processingMs
                    )
                    pendingUserPrompt = nil
                case .error:
                    errorMessage = event.message ?? "Enhancement failed"
                    showError = true
                    userPrompt = sentPrompt
                    pendingUserPrompt = nil
                    streamingContent = ""
                }
            }
        } catch let error as APIError {
            if case .notFound = error {
                currentThread = nil
                turns = []
                pendingUserPrompt = nil
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
            pendingUserPrompt = nil
            streamingContent = ""
        } catch {
            errorMessage = "Stream connection failed"
            showError = true
            userPrompt = sentPrompt
            pendingUserPrompt = nil
            streamingContent = ""
        }
    }

    // MARK: - Reset

    func resetThread() {
        currentThread = nil
        turns = []
        userPrompt = ""
        pendingUserPrompt = nil
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
}

// MARK: - ThreadTurnRecord Convenience Init

extension ThreadTurnRecord {
    init(id: String, turnIndex: Int, originalPrompt: String, enhancedPrompt: String, model: String, totalTokens: Int, processingMs: Int, createdAt: Date) {
        self.id = id
        self.turnIndex = turnIndex
        self.originalPrompt = originalPrompt
        self.enhancedPrompt = enhancedPrompt
        self.model = model
        self.totalTokens = totalTokens
        self.processingMs = processingMs
        self.createdAt = createdAt
    }
}
