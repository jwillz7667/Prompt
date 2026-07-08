//
//  OptimizeViewModel.swift
//  Prompt
//
//  State machine for the reflection-loop optimizer. Drives one optimization
//  job at a time: submit → live SSE progress → terminal outcome, with a
//  polling fallback when the stream drops mid-job (the job survives on the
//  server, so a dropped connection must never fail the optimization).
//

import Foundation

@Observable
@MainActor
final class OptimizeViewModel {

    // MARK: - State Machine

    enum State: Equatable {
        case idle
        /// POST accepted or in flight; no backend stage label yet.
        case submitting
        /// `stageLabel` is the backend progress label verbatim
        /// ("Testing candidates…"); `progress` is a monotonic 0...1 estimate.
        case running(stageLabel: String, progress: Double)
        case completed(OptimizeOutcome)
        case failed(message: String, isRetryable: Bool)
        /// REFLECTION_LOOP_ENABLED is off server-side — hide the surface.
        case featureDisabled
        /// Tier gate or quota — route to the paywall.
        case upgradeRequired
    }

    /// Lifecycle of saving the winning template to the user's library
    /// (POST /api/v1/templates).
    enum TemplateSaveState: Equatable {
        case idle
        case saving
        case saved
        case failed(message: String)
    }

    private(set) var state: State = .idle
    private(set) var jobId: String?
    private(set) var mode: OptimizeMode?
    private(set) var rolloutsUsed = 0
    private(set) var templateSaveState: TemplateSaveState = .idle

    // MARK: - Dependencies

    private let service: OptimizeService
    private var activeTask: Task<Void, Never>?

    /// - Parameter service: injectable for testing; defaults to the shared
    ///   instance (resolved in the isolated body — a `.shared` default
    ///   argument is nonisolated under SWIFT_DEFAULT_ACTOR_ISOLATION).
    init(service: OptimizeService? = nil) {
        self.service = service ?? .shared
    }

    // MARK: - Derived State (comparison-view accessors)

    var isBusy: Bool {
        switch state {
        case .submitting, .running: return true
        case .idle, .completed, .failed, .featureDisabled, .upgradeRequired: return false
        }
    }

    var stageLabel: String? {
        guard case .running(let label, _) = state else { return nil }
        return label
    }

    var progressFraction: Double {
        switch state {
        case .running(_, let progress): return progress
        case .completed: return 1
        case .idle, .submitting, .failed, .featureDisabled, .upgradeRequired: return 0
        }
    }

    var outcome: OptimizeOutcome? {
        guard case .completed(let outcome) = state else { return nil }
        return outcome
    }

    var optimizedOutcome: OptimizeOutcome.Optimized? {
        guard case .completed(.optimized(let optimized)) = state else { return nil }
        return optimized
    }

    /// Weighted-total movement original → winner (nil unless optimized).
    var scoreDelta: Double? { optimizedOutcome?.scoreDelta }

    /// Honest receipts (spec §6): true when the untouched original outscored
    /// every candidate. Nil unless optimized.
    var originalWon: Bool? { optimizedOutcome?.originalWon }

    /// Criterion-aligned original/winner score pairs for the comparison view.
    var receiptPairs: [OptimizeReceiptPair] { optimizedOutcome?.receiptPairs ?? [] }

    // MARK: - Actions

    /// Starts one optimization job. No-ops while a job is in flight or when
    /// the prompt is blank.
    func optimize(
        rawPrompt: String,
        goal: String? = nil,
        targetModelFamily: TargetModelFamily? = nil,
        variableValues: [String: String]? = nil
    ) {
        guard !isBusy else { return }

        let trimmedPrompt = rawPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedPrompt.isEmpty else { return }

        state = .submitting
        jobId = nil
        mode = nil
        rolloutsUsed = 0
        templateSaveState = .idle

        activeTask = Task { [weak self] in
            await self?.run(
                rawPrompt: trimmedPrompt,
                goal: goal,
                targetModelFamily: targetModelFamily,
                variableValues: variableValues
            )
        }
    }

    /// Cancels client-side observation. The server job keeps running; its
    /// result stays fetchable via the job id until the server TTL expires.
    func cancel() {
        activeTask?.cancel()
        activeTask = nil
        if isBusy {
            state = .idle
        }
    }

    func reset() {
        cancel()
        state = .idle
        jobId = nil
        mode = nil
        rolloutsUsed = 0
        templateSaveState = .idle
    }

    /// Called when the optimize sheet (re)opens. Clears a finished run so the
    /// setup form shows again, but preserves `featureDisabled` (a server-side
    /// flag that will not change between opens) and leaves an in-flight job
    /// untouched so reopening mid-run resumes live progress — the job
    /// survives server-side either way.
    func prepareForNewRun() {
        switch state {
        case .completed, .failed, .upgradeRequired:
            reset()
        case .idle, .submitting, .running, .featureDisabled:
            break
        }
    }

    /// Saves the winning packaged template to the user's template library
    /// (POST /api/v1/templates — `createTemplateSchema` in routes/templates.ts).
    /// No-ops unless the current outcome is `.optimized`; re-invocable after
    /// `.failed`, idempotent once `.saved`.
    func saveWinnerAsTemplate() async {
        guard let optimized = optimizedOutcome else { return }
        switch templateSaveState {
        case .saving, .saved:
            return
        case .idle, .failed:
            break
        }

        templateSaveState = .saving

        let title = optimized.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let summary = optimized.summaryBullets.joined(separator: " • ")
        let request = CreateTemplateRequest(
            name: String((title.isEmpty ? "Optimized Prompt" : title).prefix(100)),
            content: String(optimized.templateText.prefix(10_000)),
            description: summary.isEmpty ? nil : String(summary.prefix(500)),
            category: "Optimized",
            modality: "text",
            icon: "wand.and.stars"
        )

        do {
            let _: CreateTemplateResponse = try await APIClient.shared.request(
                "/templates",
                method: .post,
                body: request,
                timeoutInterval: 30
            )
            templateSaveState = .saved
        } catch let error as APIError {
            templateSaveState = .failed(message: error.errorDescription ?? "Couldn't save template")
        } catch {
            templateSaveState = .failed(message: "Couldn't save template")
        }
    }

    // MARK: - Job Lifecycle

    private func run(
        rawPrompt: String,
        goal: String?,
        targetModelFamily: TargetModelFamily?,
        variableValues: [String: String]?
    ) async {
        do {
            let start = try await service.startOptimization(
                rawPrompt: rawPrompt,
                goal: goal,
                targetModelFamily: targetModelFamily,
                variableValues: variableValues
            )
            jobId = start.jobId
            mode = start.mode

            // Stay in .submitting until the first backend progress event so
            // every running-stage label is backend copy, verbatim.
            try await streamUntilTerminal(jobId: start.jobId)
        } catch {
            handleFailure(error)
        }
    }

    private func streamUntilTerminal(jobId: String) async throws {
        do {
            for try await event in service.streamProgress(jobId: jobId) {
                try Task.checkCancellation()
                apply(event)
                if case .completed = state {
                    return
                }
            }

            // The stream ended without a terminal result ([DONE] always
            // follows a result event, so a bare end means the connection was
            // reaped mid-job). The job survives server-side — poll it out.
            try await pollUntilTerminal(jobId: jobId)
        } catch let error as OptimizeError {
            guard case .transport = error else {
                throw error // Terminal verdicts: polling cannot change them.
            }
            try await pollUntilTerminal(jobId: jobId)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            // Untyped transport failure (URLError mid-stream) — same fallback.
            try await pollUntilTerminal(jobId: jobId)
        }
    }

    /// Poll fallback. 2 s cadence with backoff to 15 s on transient errors;
    /// the loop itself is the retry mechanism, so only terminal OptimizeErrors
    /// propagate. Deadline guards against a job the server lost track of
    /// without ever reporting failure (full loop wall clock is 20–45 s).
    private func pollUntilTerminal(jobId: String) async throws {
        let deadline = ContinuousClock.now.advanced(by: .seconds(180))
        var delay: Duration = .seconds(2)

        while ContinuousClock.now < deadline {
            try Task.checkCancellation()

            do {
                let snapshot = try await service.pollResult(jobId: jobId)

                if let latest = snapshot.progress.last {
                    applyProgress(
                        label: latest.label,
                        phase: latest.knownPhase,
                        rolloutsUsed: latest.rolloutsUsed
                    )
                }

                switch snapshot.status {
                case .completed:
                    guard let result = snapshot.result else {
                        throw OptimizeError.serverReported(message: snapshot.error ?? "Optimization failed")
                    }
                    state = .completed(result)
                    return
                case .failed:
                    throw OptimizeError.serverReported(message: snapshot.error ?? "Optimization failed")
                case .queued, .running:
                    delay = .seconds(2)
                }
            } catch let error as OptimizeError {
                guard case .transport = error else { throw error }
                delay = min(delay * 2, .seconds(15))
            }

            try await Task.sleep(for: delay)
        }

        throw OptimizeError.transport(message: "Optimization timed out. Please try again.")
    }

    // MARK: - Event Application

    private func apply(_ event: OptimizeStreamEvent) {
        switch event {
        case .progress(let progress):
            applyProgress(
                label: progress.label,
                phase: progress.knownPhase,
                rolloutsUsed: progress.rolloutsUsed
            )
        case .result(let outcome):
            state = .completed(outcome)
        case .failure:
            // Never yielded — the service finishes by throwing serverReported.
            break
        }
    }

    private func applyProgress(label: String, phase: OptimizeProgressPhase?, rolloutsUsed: Int) {
        self.rolloutsUsed = max(self.rolloutsUsed, rolloutsUsed)

        // The loop revisits test/reflect/revise phases, so clamp the fraction
        // monotonically — a progress bar must never move backward.
        let current: Double = {
            guard case .running(_, let progress) = state else { return 0 }
            return progress
        }()
        let target = phase?.fractionComplete ?? current
        state = .running(stageLabel: label, progress: max(current, target))
    }

    private func handleFailure(_ error: Error) {
        guard !(error is CancellationError) else { return }

        guard let optimizeError = error as? OptimizeError else {
            state = .failed(message: error.localizedDescription, isRetryable: true)
            return
        }

        switch optimizeError {
        case .featureDisabled:
            state = .featureDisabled
        case .upgradeRequired, .quotaExceeded:
            // Both resolve the same way for the user: upgrade. Mirrors
            // PromptViewModel routing quota exhaustion to the paywall.
            state = .upgradeRequired
        case .sessionExpired:
            // APIClient already signaled AuthManager.handleSessionExpiration()
            // on a definitive rejection; this state is just the local surface.
            state = .failed(
                message: optimizeError.errorDescription ?? "Session expired",
                isRetryable: false
            )
        case .jobNotFound, .serverReported, .transport:
            state = .failed(
                message: optimizeError.errorDescription ?? "Optimization failed",
                isRetryable: optimizeError.isRetryable
            )
        }
    }
}

// MARK: - Template Save Wire Types (createTemplateSchema, routes/templates.ts)

private struct CreateTemplateRequest: Encodable {
    let name: String
    let content: String
    let description: String?
    let category: String
    let modality: String
    let icon: String
}

private struct CreateTemplateResponse: Decodable {
    struct Template: Decodable {
        let id: String
    }

    let template: Template
}
