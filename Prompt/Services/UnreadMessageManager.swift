//
//  UnreadMessageManager.swift
//  Prompt
//
//  Tracks unread support messages for notification badges
//

import Foundation
import Combine

@MainActor
final class UnreadMessageManager: ObservableObject {
    static let shared = UnreadMessageManager()

    @Published var unreadCount: Int = 0
    @Published var hasUnreadMessages: Bool = false

    private let unreadCountKey = "support_unread_count"
    private let lastReadTimestampKey = "support_last_read_timestamp"

    private init() {
        loadUnreadCount()
    }

    // MARK: - Public Methods

    /// Increment unread count when a new message arrives
    func incrementUnread() {
        unreadCount += 1
        hasUnreadMessages = unreadCount > 0
        saveUnreadCount()
    }

    /// Mark all messages as read
    func markAllAsRead() {
        unreadCount = 0
        hasUnreadMessages = false
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: lastReadTimestampKey)
        saveUnreadCount()
    }

    /// Set specific unread count (e.g., from server)
    func setUnreadCount(_ count: Int) {
        unreadCount = max(0, count)
        hasUnreadMessages = unreadCount > 0
        saveUnreadCount()
    }

    /// Check if a message timestamp is after the last read time
    func isMessageUnread(timestamp: Date) -> Bool {
        let lastRead = UserDefaults.standard.double(forKey: lastReadTimestampKey)
        if lastRead == 0 { return true }
        return timestamp.timeIntervalSince1970 > lastRead
    }

    // MARK: - Private Methods

    private func loadUnreadCount() {
        unreadCount = UserDefaults.standard.integer(forKey: unreadCountKey)
        hasUnreadMessages = unreadCount > 0
    }

    private func saveUnreadCount() {
        UserDefaults.standard.set(unreadCount, forKey: unreadCountKey)
    }
}
