//
//  NotificationManager.swift
//  Prompt
//
//  Handles push notification registration and handling
//

import Foundation
import Combine
import UserNotifications
import UIKit

// MARK: - Notification Types

enum NotificationType: String, Sendable {
    case supportMessage = "support_message"
    case enhancementComplete = "enhancement_complete"
}

// MARK: - Notification Manager

@MainActor
final class NotificationManager: NSObject, ObservableObject {
    static let shared = NotificationManager()

    private struct NotificationPayload: Sendable {
        let type: NotificationType
        let ticketId: String?
        let promptId: String?
    }

    @Published var isAuthorized = false
    @Published var deviceToken: String?

    // Callbacks for handling notifications
    var onSupportMessageReceived: ((String) -> Void)?  // ticketId
    var onEnhancementComplete: ((String) -> Void)?     // promptId

    private override init() {
        super.init()
    }

    // MARK: - Permission Request

    func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()

        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            await MainActor.run {
                self.isAuthorized = granted
            }

            if granted {
                await registerForRemoteNotifications()
            }

            return granted
        } catch {
            print("[Notifications] Authorization error: \(error)")
            return false
        }
    }

    func checkAuthorizationStatus() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()

        await MainActor.run {
            self.isAuthorized = settings.authorizationStatus == .authorized
        }
    }

    // MARK: - Remote Notification Registration

    private func registerForRemoteNotifications() async {
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = tokenString

        print("[Notifications] Device token: \(tokenString.prefix(16))...")

        // Register with backend
        Task {
            await registerDeviceTokenWithBackend(tokenString)
        }
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        print("[Notifications] Failed to register: \(error)")
    }

    // MARK: - Backend Registration

    private func registerDeviceTokenWithBackend(_ token: String) async {
        // Determine environment (sandbox for debug, production for release)
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif

        let deviceId = UIDevice.current.identifierForVendor?.uuidString

        do {
            struct RegisterRequest: Encodable {
                let deviceToken: String
                let deviceId: String?
                let environment: String
            }

            struct EmptyResponse: Decodable {}

            let _: EmptyResponse = try await APIClient.shared.request(
                "/users/device-token",
                method: .post,
                body: RegisterRequest(
                    deviceToken: token,
                    deviceId: deviceId,
                    environment: environment
                )
            )

            print("[Notifications] Device token registered with backend")
        } catch {
            print("[Notifications] Failed to register token with backend: \(error)")
        }
    }

    func unregisterDeviceToken() async {
        guard let token = deviceToken else { return }

        do {
            struct UnregisterRequest: Encodable {
                let deviceToken: String
            }

            struct EmptyResponse: Decodable {}

            let _: EmptyResponse = try await APIClient.shared.request(
                "/users/device-token",
                method: .delete,
                body: UnregisterRequest(deviceToken: token)
            )

            print("[Notifications] Device token unregistered")
        } catch {
            print("[Notifications] Failed to unregister token: \(error)")
        }
    }

    // MARK: - Notification Handling

    func handleNotification(userInfo: [AnyHashable: Any], completion: @escaping () -> Void) {
        guard let payload = Self.notificationPayload(from: userInfo) else {
            completion()
            return
        }

        handleNotification(payload: payload, completion: completion)
    }

    private func handleNotification(payload: NotificationPayload, completion: @escaping () -> Void) {
        switch payload.type {
        case .supportMessage:
            // Increment unread count
            UnreadMessageManager.shared.incrementUnread()

            if let ticketId = payload.ticketId {
                onSupportMessageReceived?(ticketId)
            }

        case .enhancementComplete:
            if let promptId = payload.promptId {
                onEnhancementComplete?(promptId)
            }
        }

        completion()
    }

    /// Called when a support message is received via socket (app in foreground)
    func handleIncomingSupportMessage() {
        UnreadMessageManager.shared.incrementUnread()
    }

    // MARK: - Badge Management

    func clearBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0) { error in
            if let error {
                print("[Notifications] Failed to clear badge: \(error)")
            }
        }
    }

    func setBadge(_ count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(count) { error in
            if let error {
                print("[Notifications] Failed to set badge: \(error)")
            }
        }
    }

    private nonisolated static func notificationPayload(from userInfo: [AnyHashable: Any]) -> NotificationPayload? {
        guard let typeString = userInfo["type"] as? String,
              let type = NotificationType(rawValue: typeString) else {
            return nil
        }

        return NotificationPayload(
            type: type,
            ticketId: userInfo["ticketId"] as? String,
            promptId: userInfo["promptId"] as? String
        )
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationManager: UNUserNotificationCenterDelegate {
    // Called when notification is received while app is in foreground
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notification even when app is in foreground
        completionHandler([.banner, .sound, .badge])
    }

    // Called when user taps on notification
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        guard let payload = NotificationManager.notificationPayload(
            from: response.notification.request.content.userInfo
        ) else {
            completionHandler()
            return
        }

        Task { @MainActor [payload] in
            NotificationManager.shared.handleNotification(payload: payload, completion: completionHandler)
        }
    }
}
