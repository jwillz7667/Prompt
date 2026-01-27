//
//  BackgroundTaskManager.swift
//  Prompt
//
//  Manages background task execution to ensure network requests complete
//  even when the app is backgrounded or closed.
//

import UIKit

@MainActor
final class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()

    private var activeTaskId: UIBackgroundTaskIdentifier = .invalid
    private var taskName: String?

    private init() {}

    /// Begins a background task to keep the app running while performing critical work.
    /// Returns the task identifier which can be used to end the task early.
    @discardableResult
    func beginTask(named name: String, expirationHandler: (() -> Void)? = nil) -> UIBackgroundTaskIdentifier {
        // End any existing task first
        endCurrentTask()

        taskName = name
        activeTaskId = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            // System is about to kill the task - clean up
            expirationHandler?()
            self?.endCurrentTask()
        }

        return activeTaskId
    }

    /// Ends the current background task if one is active.
    func endCurrentTask() {
        guard activeTaskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(activeTaskId)
        activeTaskId = .invalid
        taskName = nil
    }

    /// Ends a specific background task by identifier.
    func endTask(_ taskId: UIBackgroundTaskIdentifier) {
        guard taskId != .invalid else { return }
        if taskId == activeTaskId {
            endCurrentTask()
        } else {
            UIApplication.shared.endBackgroundTask(taskId)
        }
    }

    /// Returns the remaining background time available.
    var remainingBackgroundTime: TimeInterval {
        UIApplication.shared.backgroundTimeRemaining
    }

    /// Whether a background task is currently active.
    var isTaskActive: Bool {
        activeTaskId != .invalid
    }
}

// MARK: - Convenience Extension for Async Work

extension BackgroundTaskManager {
    /// Executes an async operation with background task protection.
    /// The operation will continue even if the app is backgrounded.
    func performBackgroundTask<T: Sendable>(
        named name: String,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        let taskId = beginTask(named: name)

        defer {
            endTask(taskId)
        }

        return try await operation()
    }
}
