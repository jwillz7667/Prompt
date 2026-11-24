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
    @Environment(PromptHistoryManager.self) private var historyManager

    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @State private var deeplinkManager = DeeplinkManager.shared
    @State private var homeThreadViewModel = ThreadViewModel()

    @State private var showProfile = false
    @State private var showPaywall = false
    @State private var showWhatsNew = false
    @State private var didHydrateHomeThread = false
    @State private var lastObservedTurnCount = 0

    @AppStorage("homeThreadId") private var homeThreadId = ""
    @State private var backgroundedAt: Date?
    @AppStorage("lastSeenWhatsNewVersion") private var lastSeenWhatsNewVersion = ""
    @AppStorage("hasSeenOnboardingPaywall") private var hasSeenOnboardingPaywall = false
    @AppStorage("lastPaywallShownDate") private var lastPaywallShownDateString = ""
    @AppStorage("lastReviewPromptDate") private var lastReviewPromptDateString = ""
    @AppStorage("enhancementCount") private var enhancementCount = 0
    @AppStorage("didAskNotificationPermission") private var didAskNotificationPermission = false
    /// At most one automatic (not user-initiated) popup per app session.
    @State private var didAutoPresentThisSession = false

    var body: some View {
        navigationContent
        .task {
            await loadHomeThreadIfNeeded()
        }
        .onAppear {
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

    @State private var showSidebar = false
    @State private var sidebarThreadViewModel = ThreadViewModel()

    // Cap the drawer so it stays a sidebar on iPad instead of covering
    // ~1,100pt of a 13" screen.
    private let sidebarWidth: CGFloat = min(UIScreen.main.bounds.width * 0.82, 380)

    private var navigationContent: some View {
        NavigationStack {
            ZStack {
                // Main content - shifts right when sidebar is open
                mainThreadContent
                    .offset(x: showSidebar ? sidebarWidth : 0)
                    .animation(.spring(response: 0.32, dampingFraction: 0.86), value: showSidebar)

                // Dimming overlay when sidebar is open
                if showSidebar {
                    Color.black.opacity(0.4)
                        .ignoresSafeArea()
                        .offset(x: showSidebar ? sidebarWidth : 0)
                        .onTapGesture { closeSidebar() }
                        .transition(.opacity)
                        .animation(.easeOut(duration: 0.2), value: showSidebar)
                }

                // Sidebar drawer from left
                HStack(spacing: 0) {
                    ChatSidebarView(
                        threadViewModel: sidebarThreadViewModel,
                        onSelectThread: { threadId in
                            closeSidebar()
                            Task {
                                await homeThreadViewModel.loadThread(id: threadId)
                            }
                        },
                        onNewChat: {
                            closeSidebar()
                            newConversation()
                        },
                        onOpenSettings: {
                            closeSidebar()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                showProfile = true
                            }
                        },
                        onDismiss: { closeSidebar() }
                    )
                    .frame(width: sidebarWidth)

                    Spacer(minLength: 0)
                }
                .offset(x: showSidebar ? 0 : -sidebarWidth)
                .animation(.spring(response: 0.32, dampingFraction: 0.86), value: showSidebar)
            }
            .toolbar(.hidden, for: .navigationBar)
            .gesture(sidebarDragGesture)
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

    private var mainThreadContent: some View {
        ThreadView(
            viewModel: homeThreadViewModel,
            presentationStyle: .home,
            onOpenThreads: { openSidebar() },
            onOpenProfile: { showProfile = true },
            onOpenHistory: { openSidebar() },
            onOpenPaywall: { showPaywall = true },
            onStartNewConversation: newConversation
        )
    }

    private func openSidebar() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            showSidebar = true
        }
        Task {
            await sidebarThreadViewModel.fetchThreads(refresh: true)
        }
    }

    private func closeSidebar() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            showSidebar = false
        }
    }

    private var sidebarDragGesture: some Gesture {
        DragGesture(minimumDistance: 20, coordinateSpace: .global)
            .onEnded { value in
                let horizontalAmount = value.translation.width
                if horizontalAmount > 60 && !showSidebar {
                    openSidebar()
                } else if horizontalAmount < -60 && showSidebar {
                    closeSidebar()
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
        closeSidebar()
    }

    private func handleScenePhaseChange(_ newPhase: ScenePhase) {
        switch newPhase {
        case .background:
            backgroundedAt = Date()
        case .active:
            if let backgroundedAt,
               Date().timeIntervalSince(backgroundedAt) >= 300 {
                newConversation()
            }
            backgroundedAt = nil
            checkWeeklyPaywallReminder()
        default:
            break
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
            handleSuccessfulResult()
        }

        lastObservedTurnCount = newValue
    }

    private func handleHistoryDeeplink(_ shouldOpen: Bool) {
        guard shouldOpen else { return }
        openSidebar()
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
            sendPendingPromptAfterSignIn()
        }
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

        presentAutomatically(after: 1.2) {
            showWhatsNew = true
        }
    }

    // MARK: - Automatic Popups

    /// Something is already on screen (a sheet, the drawer, the sign-in
    /// cover) or a reply is still streaming.
    private var isBusyOrPresenting: Bool {
        showProfile || showPaywall || showWhatsNew || showSidebar
            || guestSession.shouldPresentAuthenticationGate
            || homeThreadViewModel.isStreaming
    }

    /// Single gate for every popup the app shows on its own (What's New,
    /// plan reminders, the notification prompt, the review prompt). It
    /// allows one per app session and never stacks one on top of another
    /// sheet. User-initiated sheets and the limit-reached paywall do not go
    /// through here.
    private func presentAutomatically(after delay: TimeInterval, _ present: @escaping () -> Void) {
        guard !didAutoPresentThisSession else { return }
        Task {
            try? await Task.sleep(for: .seconds(delay))
            guard !didAutoPresentThisSession, !isBusyOrPresenting else { return }
            didAutoPresentThisSession = true
            present()
        }
    }

    /// After a result arrives, ask for at most one thing, in this order:
    /// notifications (first result ever), the plans intro (second result,
    /// free plan, once), then an App Store review (later, rarely).
    private func handleSuccessfulResult() {
        guard authManager.isAuthenticated else { return }

        if !didAskNotificationPermission {
            presentAutomatically(after: 1.5) {
                didAskNotificationPermission = true
                Task { _ = await NotificationManager.shared.requestAuthorization() }
            }
            return
        }

        if !hasSeenOnboardingPaywall, enhancementCount >= 2, storeKit.currentTier == .free {
            presentAutomatically(after: 1.5) {
                hasSeenOnboardingPaywall = true
                updateLastPaywallShownDate()
                showPaywall = true
            }
            return
        }

        checkReviewPrompt()
    }

    /// After signing in from the guest cover, send the prompt the user was
    /// trying to send instead of making them tap Send again.
    private func sendPendingPromptAfterSignIn() {
        Task {
            // Let the sign-in cover finish dismissing first.
            try? await Task.sleep(for: .milliseconds(450))
            guard authManager.isAuthenticated,
                  homeThreadViewModel.canSend,
                  !settings.maxModeEnabled else { return }
            await homeThreadViewModel.addTurn(settings: settings, historyManager: historyManager)
            await storeKit.syncWithBackend()
        }
    }

    // MARK: - Paywall

    /// Free users who already saw the plans intro get a reminder at most
    /// once a week (it used to be every day on first foreground).
    private func checkWeeklyPaywallReminder() {
        guard authManager.isAuthenticated,
              hasSeenOnboardingPaywall,
              storeKit.currentTier == .free else { return }
        if let last = parseDate(lastPaywallShownDateString),
           let days = Calendar.current.dateComponents([.day], from: last, to: Date()).day,
           days < 7 {
            return
        }

        presentAutomatically(after: 1.5) {
            guard storeKit.currentTier == .free else { return }
            updateLastPaywallShownDate()
            showPaywall = true
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
        guard enhancementCount >= 5 else { return }

        let today = Date()
        if let lastPromptDate = parseDate(lastReviewPromptDateString) {
            let daysSinceLastPrompt = Calendar.current.dateComponents([.day], from: lastPromptDate, to: today).day ?? 0
            guard daysSinceLastPrompt >= 30 else { return }
        }

        presentAutomatically(after: 2.0) {
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
