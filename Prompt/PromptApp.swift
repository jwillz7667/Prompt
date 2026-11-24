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
    @State private var guestSessionManager = GuestSessionManager.shared

    init() {
        UserDefaults(suiteName: SharedDataManager.appGroupIdentifier)?
            .set(APIConfiguration.origin.absoluteString, forKey: "apiBaseURL")

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
            rootView
                .modelContainer(modelContainer)
        } else {
            // Database unavailable: the app still works without persistence.
            rootView
        }
    }

    private var rootView: some View {
        RootView()
            .environment(settingsManager)
            .environment(authManager)
            .environment(historyManager)
            .environment(storeKitManager)
            .environment(syncManager)
            .environment(complianceManager)
            .environment(guestSessionManager)
            .preferredColorScheme(settingsManager.appearanceMode.colorScheme)
    }
}

// MARK: - Root View

/// Launch gate: splash, then required Sign in with Apple, then a one-time
/// AI data-sharing consent, then entitlement.
/// The app shell (ContentView) is only reachable with an active
/// subscription or free trial; while entitlement is unknown the gate waits
/// (or offers a retry) and never fails open.
struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(AuthManager.self) private var authManager
    @Environment(StoreKitManager.self) private var storeKit
    @State private var splashMinimumDurationElapsed = false
    @State private var consentStore = AIDataConsentStore.shared

    private enum Stage: Equatable {
        case splash
        case signIn
        case aiConsent
        case checkingEntitlement
        case entitlementCheckFailed
        case paywall
        case app
    }

    // Screenshot / UI-test runs bypass the gates; the backend still enforces
    // entitlement on every AI request.
    private var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains("-FASTLANE_SNAPSHOT") ||
        ProcessInfo.processInfo.arguments.contains("-ui_testing")
    }

    private var stage: Stage {
        if isUITesting { return .app }
        if authManager.isCheckingSession || !splashMinimumDurationElapsed { return .splash }
        guard authManager.isAuthenticated, let userId = authManager.currentUser?.id else { return .signIn }
        // Content reaches third-party AI providers only after explicit
        // permission (App Review 5.1.2(i)), so this comes before the paywall.
        guard consentStore.hasConsented(userId: userId) else { return .aiConsent }
        switch storeKit.entitlementState {
        case .entitled:
            return .app
        case .notEntitled:
            return .paywall
        case .unknown:
            return storeKit.entitlementCheckFailed ? .entitlementCheckFailed : .checkingEntitlement
        }
    }

    var body: some View {
        Group {
            switch stage {
            case .splash:
                SplashView()
            case .signIn:
                AuthView()
            case .aiConsent:
                AIDataConsentView(consentStore: consentStore)
            case .checkingEntitlement:
                EntitlementCheckView(hasFailed: false)
            case .entitlementCheckFailed:
                EntitlementCheckView(hasFailed: true)
            case .paywall:
                PaywallView(mode: .hard)
            case .app:
                ContentView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: stage)
        .task {
            if !splashMinimumDurationElapsed {
                try? await Task.sleep(for: .seconds(1.15))
                splashMinimumDurationElapsed = true
            }

            if authManager.isAuthenticated {
                await storeKit.refreshEntitlement()
                await VariationsService.shared.bootstrap()
                await setupNotifications()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active, authManager.isAuthenticated else { return }
            Task {
                await storeKit.refreshEntitlement()
                await VariationsService.shared.appDidBecomeActive()
            }
        }
        .onChange(of: authManager.isAuthenticated) { _, isAuthenticated in
            guard isAuthenticated else { return }
            Task {
                await storeKit.refreshEntitlement()
                await VariationsService.shared.bootstrap()
                await setupNotifications()
            }
        }
    }

    private func setupNotifications() async {
        // Notification taps previously did nothing. Route them to the
        // closest existing screen: support replies live under Profile,
        // finished prompts live in the chat sidebar.
        NotificationManager.shared.onSupportMessageReceived = { _ in
            DeeplinkManager.shared.shouldOpenSettings = true
        }

        NotificationManager.shared.onEnhancementComplete = { _ in
            DeeplinkManager.shared.shouldOpenHistory = true
        }

        // Do not show the system permission prompt on launch. Ask after the
        // first successful result (ContentView), when the value is obvious.
        // If the user already answered, this refreshes the APNs token
        // without prompting again.
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status != .notDetermined {
            _ = await NotificationManager.shared.requestAuthorization()
        }
    }
}

// MARK: - Entitlement Check View

/// Shown between sign-in and the app while the subscription is verified.
/// On failure it offers a retry instead of letting the user in.
struct EntitlementCheckView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(PromptHistoryManager.self) private var historyManager

    let hasFailed: Bool

    @State private var isConfirmingAccountDeletion = false
    /// A check that runs this long is likely stuck on a bad connection; the
    /// user is then offered a way out instead of an endless spinner.
    @State private var isTakingLong = false
    private static let slowCheckThreshold: Duration = .seconds(8)

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            VStack(spacing: 20) {
                AppBrandMark(size: 88, showsGlassBackdrop: true)

                if hasFailed {
                    VStack(spacing: 8) {
                        Text("Couldn't verify your subscription")
                            .font(.system(.title3, design: .rounded, weight: .bold))
                            .foregroundStyle(Color.adaptiveTextPrimary)
                        Text("Check your internet connection and try again.")
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(Color.adaptiveTextSecondary)
                    }
                    .multilineTextAlignment(.center)

                    Button {
                        Task { await storeKit.refreshEntitlement() }
                    } label: {
                        HStack(spacing: 8) {
                            if storeKit.isCheckingEntitlement {
                                ProgressView()
                                    .tint(Color.adaptiveTextOnAccent)
                            }
                            Text("Try Again")
                                .font(.system(.headline, design: .rounded, weight: .bold))
                        }
                        .frame(maxWidth: 280)
                        .padding(.vertical, 14)
                        .foregroundStyle(Color.adaptiveTextOnAccent)
                    }
                    .buttonStyle(LiquidGlassButtonStyle(
                        cornerRadius: 16,
                        tintColor: Color.adaptiveButtonPrimary,
                        intensity: .prominent
                    ))
                    .disabled(storeKit.isCheckingEntitlement)
                    .accessibilityIdentifier("entitlement.retry")

                    accountActions
                } else {
                    ProgressView()
                        .tint(Color.brandCyan)
                    Text("Checking your subscription…")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(Color.adaptiveTextSecondary)
                    if isTakingLong {
                        accountActions
                            .transition(.opacity)
                    }
                }
            }
            .padding(24)
        }
        .animation(.easeInOut(duration: 0.25), value: isTakingLong)
        .deleteAccountFlow(isPresented: $isConfirmingAccountDeletion)
        .task(id: hasFailed) {
            isTakingLong = false
            guard !hasFailed else { return }
            try? await Task.sleep(for: Self.slowCheckThreshold)
            guard !Task.isCancelled else { return }
            isTakingLong = true
        }
    }

    private var accountActions: some View {
        VStack(spacing: 10) {
            Button("Sign out") {
                Task {
                    await authManager.signOut()
                    historyManager.clearLocalData()
                }
            }
            .font(.system(.footnote, design: .rounded, weight: .semibold))
            .foregroundStyle(Color.adaptiveTextSecondary)
            .accessibilityIdentifier("entitlement.signOut")

            Button("Delete Account", role: .destructive) {
                isConfirmingAccountDeletion = true
            }
            .font(.system(.footnote, design: .rounded, weight: .semibold))
            .accessibilityIdentifier("entitlement.deleteAccount")
        }
    }
}

// MARK: - Splash View

struct SplashView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var logoScale = 0.84
    @State private var logoRotation = -14.0
    @State private var wordmarkOpacity = 0.0
    @State private var wordmarkOffset = 22.0

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }

    var body: some View {
        ZStack {
            // Liquid Glass animated background
            LiquidGlassBackground()

            VStack(spacing: 24) {
                AppBrandMark(size: 132, showsGlassBackdrop: false)
                    .scaleEffect(logoScale)
                    .rotationEffect(.degrees(logoRotation))

                VStack(spacing: 8) {
                    Text("Promptomize")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(textPrimary)

                    Text("Sharper prompts and an AI assistant in one app")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(Color.adaptiveTextSecondary)
                }
                .opacity(wordmarkOpacity)
                .offset(y: wordmarkOffset)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.78, dampingFraction: 0.8)) {
                logoScale = 1.0
                logoRotation = 0
            }

            withAnimation(.easeOut(duration: 0.52).delay(0.12)) {
                wordmarkOpacity = 1
                wordmarkOffset = 0
            }
        }
    }
}
