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

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settingsManager)
                .environment(authManager)
                .environment(historyManager)
        }
    }
}

// MARK: - Root View

struct RootView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        Group {
            if authManager.isAuthenticated {
                ContentView()
            } else {
                AuthView()
            }
        }
        .animation(.easeInOut, value: authManager.isAuthenticated)
    }
}
