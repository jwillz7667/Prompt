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
    @Environment(GuestSessionManager.self) private var guestSession
    @Environment(SettingsManager.self) private var settings
    @Environment(StoreKitManager.self) private var storeKit

    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @State private var deeplinkManager = DeeplinkManager.shared
    @State private var homeThreadViewModel = ThreadViewModel()

    @State private var showHistory = false
    @State private var showProfile = false
    @State private var showPaywall = false
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
        navigationContent
        .task {
            await loadHomeThreadIfNeeded()
        }
        .onAppear {
            checkPaywallReminder()
            checkWhatsNew()
        }
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhaseChange(newPhase)
        }
        .onChange(of: authManager.currentUser?.id) { _, newId in
            guard newId != nil else { return }
            guestSession.completeAuthenticationFlow()
        }
        .onChange(of: homeThreadViewModel.currentThread?.id) { _, newId in
            handleThreadIdentityChange(newId)
        }
        .onChange(of: homeThreadViewModel.turns.count) { oldValue, newValue in
            handleTurnCountChange(oldValue: oldValue, newValue: newValue)
        }
        .onChange(of: deeplinkManager.shouldOpenHistory) { _, shouldOpen in
            handleHistoryDeeplink(shouldOpen)
        }
        .onChange(of: deeplinkManager.shouldOpenSettings) { _, shouldOpen in
            handleSettingsDeeplink(shouldOpen)
        }
        .onChange(of: deeplinkManager.shouldOpenPaywall) { _, shouldOpen in
            handlePaywallDeeplink(shouldOpen)
        }
        .onChange(of: deeplinkManager.shouldOpenEnhance) { _, shouldOpen in
            handleEnhanceDeeplink(shouldOpen)
        }
    }

    private var navigationContent: some View {
        NavigationStack {
            ZStack {
                ThreadView(
                    viewModel: homeThreadViewModel,
                    presentationStyle: .home,
                    onOpenThreads: { showHistory = true },
                    onOpenProfile: { showProfile = true },
                    onOpenHistory: { showHistory = true },
                    onOpenPaywall: { showPaywall = true },
                    onStartNewConversation: newConversation
                )
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showHistory, content: historySheet)
            .sheet(isPresented: $showProfile, content: profileSheet)
            .sheet(isPresented: $showPaywall, content: paywallSheet)
            .sheet(isPresented: $showWhatsNew, content: whatsNewSheet)
            .fullScreenCover(isPresented: authenticationGateBinding, content: authGateSheet)
            .overlay(alignment: .top) {
                OfflineBanner()
                    .animation(.spring(response: 0.3), value: networkMonitor.isConnected)
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

    private func applyHistoryPrompt(_ prompt: PromptRecord) {
        homeThreadViewModel.userPrompt = prompt.originalPrompt
        homeThreadViewModel.selectedImageAttachment = prompt.imageAttachment
        if let modality = ModalityType(rawValue: prompt.modality) {
            settings.selectedModality = modality
            settings.savePreferences()
        }
        showHistory = false
    }

    private func handleScenePhaseChange(_ newPhase: ScenePhase) {
        if newPhase == .active {
            checkDailyPaywallReminder()
        }
    }

    private func handleThreadIdentityChange(_ newValue: String?) {
        homeThreadId = newValue ?? ""
        if newValue == nil {
            lastObservedTurnCount = 0
        }
    }

    private func handleTurnCountChange(oldValue: Int, newValue: Int) {
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

    private func handleHistoryDeeplink(_ shouldOpen: Bool) {
        guard shouldOpen else { return }
        showHistory = true
        deeplinkManager.clearHistoryTrigger()
    }

    private func handleSettingsDeeplink(_ shouldOpen: Bool) {
        guard shouldOpen else { return }
        showProfile = true
        deeplinkManager.clearSettingsTrigger()
    }

    private func handlePaywallDeeplink(_ shouldOpen: Bool) {
        guard shouldOpen else { return }
        showPaywall = true
        deeplinkManager.clearPaywallTrigger()
    }

    private func handleEnhanceDeeplink(_ shouldOpen: Bool) {
        guard shouldOpen else { return }
        deeplinkManager.clearEnhanceTrigger()
    }

    private var authenticationGateBinding: Binding<Bool> {
        Binding(
            get: { guestSession.shouldPresentAuthenticationGate },
            set: { guestSession.shouldPresentAuthenticationGate = $0 }
        )
    }

    @ViewBuilder
    private func profileSheet() -> some View {
        ProfileView()
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(24)
    }

    @ViewBuilder
    private func historySheet() -> some View {
        HistoryView(onRerunPrompt: applyHistoryPrompt)
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(24)
    }

    @ViewBuilder
    private func paywallSheet() -> some View {
        PaywallView()
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(24)
    }

    @ViewBuilder
    private func whatsNewSheet() -> some View {
        WhatsNewView {
            lastSeenWhatsNewVersion = currentAppVersion
            showWhatsNew = false
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(24)
    }

    @ViewBuilder
    private func authGateSheet() -> some View {
        AuthView(mode: .guestUnlock) {
            guestSession.completeAuthenticationFlow()
            presentOnboardingPaywallIfNeeded()
        }
        .interactiveDismissDisabled(true)
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
            presentOnboardingPaywallIfNeeded(delay: 0.8)
        }
    }

    private func checkDailyPaywallReminder() {
        guard authManager.isAuthenticated else { return }
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

    private func presentOnboardingPaywallIfNeeded(delay: TimeInterval = 0.45) {
        guard !hasSeenOnboardingPaywall else { return }

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard !hasSeenOnboardingPaywall else { return }
            showPaywall = true
            hasSeenOnboardingPaywall = true
            updateLastPaywallShownDate()
        }
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
