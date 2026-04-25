//
//  ThreadSyncBroadcaster.swift
//  Prompt
//
//  Cross-instance sync for ThreadViewModel. The app runs multiple
//  ThreadViewModel instances (home, sidebar, history, thread list) and they
//  each own an independent `threads` array. Without a broadcast mechanism the
//  sidebar/history panels don't see threads created/updated in the main chat
//  until the next network refresh, which is why new chats only appear after
//  reopening the app.
//

import Foundation

@MainActor
final class ThreadSyncBroadcaster {
    static let shared = ThreadSyncBroadcaster()

    private struct WeakObserver {
        weak var viewModel: ThreadViewModel?
    }

    private var observers: [WeakObserver] = []

    private init() {}

    func register(_ viewModel: ThreadViewModel) {
        prune()
        guard !observers.contains(where: { $0.viewModel === viewModel }) else { return }
        observers.append(WeakObserver(viewModel: viewModel))
    }

    func unregister(_ viewModel: ThreadViewModel) {
        observers.removeAll { $0.viewModel === viewModel || $0.viewModel == nil }
    }

    func broadcastUpsert(_ thread: ThreadRecord, from source: ThreadViewModel) {
        prune()
        for observer in observers where observer.viewModel !== source {
            observer.viewModel?.applyRemoteThreadUpsert(thread)
        }
    }

    func broadcastDeletion(id: String, from source: ThreadViewModel) {
        prune()
        for observer in observers where observer.viewModel !== source {
            observer.viewModel?.applyRemoteThreadDeletion(id: id)
        }
    }

    private func prune() {
        observers.removeAll { $0.viewModel == nil }
    }
}
