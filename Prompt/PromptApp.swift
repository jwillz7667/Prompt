//
//  PromptApp.swift
//  Prompt
//
//  Created by Justin Williams on 1/18/26.
//

import SwiftUI

@main
struct PromptApp: App {
    @State private var settingsManager = SettingsManager()
    @State private var authManager = AuthManager.shared
    @State private var historyManager = PromptHistoryManager.shared
    @State private var storeKitManager = StoreKitManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settingsManager)
                .environment(authManager)
                .environment(historyManager)
                .environment(storeKitManager)
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

// MARK: - Splash View (Brand Colors: Purple #512AD4, Cyan #00FFF9)

struct SplashView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var isAnimating = false
    @State private var glowPulse: CGFloat = 0.3

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        ZStack {
            // Liquid Glass animated background
            LiquidGlassBackground()

            VStack(spacing: 24) {
                // App Logo with glow effect
                ZStack {
                    // Glow behind logo
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [accentColor.opacity(glowPulse), Color.clear],
                                center: .center,
                                startRadius: 20,
                                endRadius: 100
                            )
                        )
                        .frame(width: 180, height: 180)
                        .blur(radius: 20)

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
                }

                Text("Promptomize")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(textPrimary)

                ProgressView()
                    .tint(accentColor)
                    .scaleEffect(1.2)
                    .padding(.top, 20)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                isAnimating = true
            }
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                glowPulse = 0.5
            }
        }
    }
}
