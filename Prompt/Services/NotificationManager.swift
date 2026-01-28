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

enum NotificationType: String {
    case supportMessage = "support_message"
    case enhancementComplete = "enhancement_complete"
}

// MARK: - Notification Manager

@MainActor
final class NotificationManager: NSObject, ObservableObject {
    static let shared = NotificationManager()

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
        guard let typeString = userInfo["type"] as? String,
              let type = NotificationType(rawValue: typeString) else {
            completion()
            return
        }

        switch type {
        case .supportMessage:
            if let ticketId = userInfo["ticketId"] as? String {
                onSupportMessageReceived?(ticketId)
            }

        case .enhancementComplete:
            if let promptId = userInfo["promptId"] as? String {
                onEnhancementComplete?(promptId)
            }
        }

        completion()
    }

    // MARK: - Badge Management

    func clearBadge() {
        UIApplication.shared.applicationIconBadgeNumber = 0
    }

    func setBadge(_ count: Int) {
        UIApplication.shared.applicationIconBadgeNumber = count
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
        let userInfo = response.notification.request.content.userInfo

        Task { @MainActor in
            handleNotification(userInfo: userInfo, completion: completionHandler)
        }
    }
}
