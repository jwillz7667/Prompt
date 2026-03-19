//
//  PromptApp.swift
//  Prompt
//
//  Created by Justin Williams on 1/18/26.
//

import SwiftUI
import SwiftData
import UserNotifications

// MARK: - App Delegate for Push Notifications

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set notification delegate
        UNUserNotificationCenter.current().delegate = NotificationManager.shared
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            NotificationManager.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            NotificationManager.shared.didFailToRegisterForRemoteNotifications(error: error)
        }
    }
}

@main
struct PromptApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    @State private var settingsManager = SettingsManager()
    @State private var authManager = AuthManager.shared
    @State private var historyManager = PromptHistoryManager.shared
    @State private var storeKitManager = StoreKitManager.shared
    @State private var syncManager = SyncManager.shared
    @State private var deeplinkManager = DeeplinkManager.shared
    @State private var complianceManager = AppStoreComplianceManager.shared

    init() {
        // Configure Firebase Analytics and Crashlytics
        AnalyticsService.shared.configure()
    }

    var body: some Scene {
        WindowGroup {
            contentView
                .onOpenURL { url in
                    // Handle deeplinks from widgets, notifications, etc.
                    deeplinkManager.handleURL(url)
                }
        }
    }

    @ViewBuilder
    private var contentView: some View {
        if let modelContainer = SwiftDataManager.shared.modelContainer {
            RootView()
                .environment(settingsManager)
                .environment(authManager)
                .environment(historyManager)
                .environment(storeKitManager)
                .environment(syncManager)
                .environment(complianceManager)
                .modelContainer(modelContainer)
                .preferredColorScheme(settingsManager.appearanceMode.colorScheme)
                .task {
                    // Load subscription data when app starts
                    await storeKitManager.checkEntitlements()
                }
        } else {
            // Fallback when database is unavailable - app still works without persistence
            RootView()
                .environment(settingsManager)
                .environment(authManager)
                .environment(historyManager)
                .environment(storeKitManager)
                .environment(syncManager)
                .environment(complianceManager)
                .preferredColorScheme(settingsManager.appearanceMode.colorScheme)
                .task {
                    // Load subscription data when app starts
                    await storeKitManager.checkEntitlements()
                }
        }
    }
}

// MARK: - Root View

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(AuthManager.self) private var authManager
    @State private var showSupportTicket: String?

    // Check if running in UI test / screenshot mode
    private var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains("-FASTLANE_SNAPSHOT") ||
        ProcessInfo.processInfo.arguments.contains("-ui_testing")
    }

    var body: some View {
        Group {
            if isUITesting {
                // Bypass auth for UI testing/screenshots
                ContentView()
            } else if authManager.isCheckingSession {
                SplashView()
            } else if authManager.isAuthenticated {
                ContentView()
            } else {
                AuthView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authManager.isAuthenticated)
        .animation(.easeInOut(duration: 0.3), value: authManager.isCheckingSession)
        .task {
            await VariationsService.shared.bootstrap()
            // Request notification permissions when authenticated
            if authManager.isAuthenticated {
                await setupNotifications()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard authManager.isAuthenticated else { return }

            if newPhase == .active {
                Task {
                    await VariationsService.shared.appDidBecomeActive()
                }
            }
        }
        .onChange(of: authManager.isAuthenticated) { _, isAuthenticated in
            if isAuthenticated {
                Task {
                    await VariationsService.shared.bootstrap()
                    await setupNotifications()
                }
            }
        }
    }

    private func setupNotifications() async {
        // Request authorization
        _ = await NotificationManager.shared.requestAuthorization()

        // Set up notification handlers
        NotificationManager.shared.onSupportMessageReceived = { ticketId in
            // Handle support message tap - could navigate to ticket
            showSupportTicket = ticketId
        }

        NotificationManager.shared.onEnhancementComplete = { promptId in
            // Handle enhancement complete tap - could navigate to prompt
            print("[Notifications] Enhancement complete for prompt: \(promptId)")
        }
    }
}

// MARK: - Splash View

struct SplashView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var isAnimating = false

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }

    var body: some View {
        ZStack {
            // Liquid Glass animated background
            LiquidGlassBackground()

            VStack(spacing: 24) {
                // App Logo (no glow)
                Group {
                    if UIImage(named: "AppLogo") != nil {
                        Image("AppLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 120, height: 120)
                    } else {
                        Image(systemName: "wand.and.stars")
                            .font(.system(size: 80, weight: .light))
                            .foregroundStyle(textPrimary)
                    }
                }
                .scaleEffect(isAnimating ? 1.05 : 1.0)

                Text("Promptomize")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(textPrimary)

                ProgressView()
                    .tint(colorScheme == .light ? Color.brandPurple : Color.brandCyan)
                    .scaleEffect(1.8)
                    .padding(.top, 20)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                isAnimating = true
            }
        }
    }
}
