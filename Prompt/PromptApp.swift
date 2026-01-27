//
//  PromptApp.swift
//  Prompt
//
//  Created by Justin Williams on 1/18/26.
//

import SwiftUI
import SwiftData

@main
struct PromptApp: App {
    @State private var settingsManager = SettingsManager()
    @State private var authManager = AuthManager.shared
    @State private var historyManager = PromptHistoryManager.shared
    @State private var storeKitManager = StoreKitManager.shared
    @State private var syncManager = SyncManager.shared
    @State private var deeplinkManager = DeeplinkManager.shared

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
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        Group {
            if authManager.isCheckingSession {
                SplashView()
            } else if authManager.isAuthenticated {
                ContentView()
            } else {
                AuthView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authManager.isAuthenticated)
        .animation(.easeInOut(duration: 0.3), value: authManager.isCheckingSession)
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
                    .scaleEffect(1.2)
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
