//
//  ContentView.swift
//  Prompt
//
//  Chat-native home screen that hosts the primary optimization thread.
//

import SwiftUI
import UIKit
import StoreKit

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(AuthManager.self) private var authManager
    @Environment(StoreKitManager.self) private var storeKit

    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @State private var deeplinkManager = DeeplinkManager.shared
    @State private var homeThreadViewModel = ThreadViewModel()

    @State private var showSettings = false
    @State private var showHistory = false
    @State private var showProfile = false
    @State private var showPaywall = false
    @State private var showThreads = false
    @State private var showWhatsNew = false
    @State private var didHydrateHomeThread = false
    @State private var lastObservedTurnCount = 0

    @AppStorage("homeThreadId") private var homeThreadId = ""
    @AppStorage("lastSeenWhatsNewVersion") private var lastSeenWhatsNewVersion = ""
    @AppStorage("hasSeenOnboardingPaywall") private var hasSeenOnboardingPaywall = false
    @AppStorage("lastPaywallShownDate") private var lastPaywallShownDateString = ""
    @AppStorage("lastReviewPromptDate") private var lastReviewPromptDateString = ""
    @AppStorage("enhancementCount") private var enhancementCount = 0

    var body: some View {
        NavigationStack {
            ZStack {
                ThreadView(
                    viewModel: homeThreadViewModel,
                    presentationStyle: .home,
                    onOpenThreads: { showThreads = true },
                    onOpenProfile: { showProfile = true },
                    onOpenHistory: { showHistory = true },
                    onOpenSettings: { showSettings = true },
                    onOpenPaywall: { showPaywall = true },
                    onStartNewConversation: { newConversation() }
                )
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showSettings) {
                ProfileView()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showHistory) {
                HistoryView { originalPrompt in
                    homeThreadViewModel.userPrompt = originalPrompt
                }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showProfile) {
                ProfileView()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showPaywall) {
                PaywallView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showThreads) {
                ThreadListView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
            .sheet(isPresented: $showWhatsNew) {
                WhatsNewView {
                    lastSeenWhatsNewVersion = currentAppVersion
                    showWhatsNew = false
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
            }
            .overlay(alignment: .top) {
                OfflineBanner()
                    .animation(.spring(response: 0.3), value: networkMonitor.isConnected)
            }
        }
        .task {
            await loadHomeThreadIfNeeded()
        }
        .onAppear {
            checkPaywallReminder()
            checkWhatsNew()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                checkDailyPaywallReminder()
            }
        }
        .onChange(of: homeThreadViewModel.currentThread?.id) { _, newId in
            homeThreadId = newId ?? ""
            if newId == nil {
                lastObservedTurnCount = 0
            }
        }
        .onChange(of: homeThreadViewModel.turns.count) { oldValue, newValue in
            guard didHydrateHomeThread else { return }
            guard newValue > oldValue else {
                lastObservedTurnCount = newValue
                return
            }

            let delta = max(0, newValue - max(oldValue, lastObservedTurnCount))
            if delta > 0 {
                enhancementCount += delta
                checkReviewPrompt()
            }

            lastObservedTurnCount = newValue
        }
        .onChange(of: deeplinkManager.shouldOpenHistory) { _, shouldOpen in
            if shouldOpen {
                showHistory = true
                deeplinkManager.clearHistoryTrigger()
            }
        }
        .onChange(of: deeplinkManager.shouldOpenSettings) { _, shouldOpen in
            if shouldOpen {
                showSettings = true
                deeplinkManager.clearSettingsTrigger()
            }
        }
        .onChange(of: deeplinkManager.shouldOpenPaywall) { _, shouldOpen in
            if shouldOpen {
                showPaywall = true
                deeplinkManager.clearPaywallTrigger()
            }
        }
        .onChange(of: deeplinkManager.shouldOpenEnhance) { _, shouldOpen in
            if shouldOpen {
                deeplinkManager.clearEnhanceTrigger()
            }
        }
    }

    // MARK: - Home Thread

    private func loadHomeThreadIfNeeded() async {
        defer {
            lastObservedTurnCount = homeThreadViewModel.turns.count
            didHydrateHomeThread = true
        }

        guard !homeThreadId.isEmpty else { return }

        await homeThreadViewModel.loadThread(id: homeThreadId)
        if homeThreadViewModel.currentThread == nil {
            homeThreadId = ""
            homeThreadViewModel.resetThread()
        }
    }

    private func newConversation() {
        homeThreadViewModel.resetThread()
        homeThreadId = ""
        lastObservedTurnCount = 0
        didHydrateHomeThread = true
    }

    // MARK: - What's New

    private var currentAppVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    private func checkWhatsNew() {
        guard lastSeenWhatsNewVersion != currentAppVersion else { return }
        guard !lastSeenWhatsNewVersion.isEmpty else {
            lastSeenWhatsNewVersion = currentAppVersion
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            showWhatsNew = true
        }
    }

    // MARK: - Paywall

    private func checkPaywallReminder() {
        if !hasSeenOnboardingPaywall && authManager.isAuthenticated {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                showPaywall = true
                hasSeenOnboardingPaywall = true
                updateLastPaywallShownDate()
            }
        }
    }

    private func checkDailyPaywallReminder() {
        guard storeKit.currentTier == .free else { return }
        let today = formattedDate(Date())
        guard lastPaywallShownDateString != today else { return }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            if storeKit.currentTier == .free {
                showPaywall = true
                updateLastPaywallShownDate()
            }
        }
    }

    private func updateLastPaywallShownDate() {
        lastPaywallShownDateString = formattedDate(Date())
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    // MARK: - Review Prompt

    private func checkReviewPrompt() {
        guard enhancementCount >= 3 else { return }

        let today = Date()
        if let lastPromptDate = parseDate(lastReviewPromptDateString) {
            let daysSinceLastPrompt = Calendar.current.dateComponents([.day], from: lastPromptDate, to: today).day ?? 0
            guard daysSinceLastPrompt >= 3 else { return }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            requestAppReview()
            lastReviewPromptDateString = formattedDate(today)
        }
    }

    private func requestAppReview() {
        if let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) {
            AppStore.requestReview(in: windowScene)
        }
    }

    private func parseDate(_ dateString: String) -> Date? {
        guard !dateString.isEmpty else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: dateString)
    }
}

#Preview {
    ContentView()
        .environment(SettingsManager())
        .environment(AuthManager.shared)
        .environment(PromptHistoryManager.shared)
        .environment(StoreKitManager.shared)
}

struct SyncStatusIndicator: View {
    let pendingCount: Int
    let isSyncing: Bool
    let isOnline: Bool

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 4) {
            if isSyncing {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(0.7)
                    .tint(Color.brandCyan)
            } else if !isOnline {
                Image(systemName: "cloud.slash.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.orange)
            } else {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.brandCyan)
            }

            if pendingCount > 0 {
                Text("\(pendingCount)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(colorScheme == .dark ? Color.brandCyan : Color.brandPurple)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .liquidGlassChip(isSelected: false)
    }
}
