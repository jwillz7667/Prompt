//
//  ContentView.swift
//  Prompt
//
//  App shell shown only to signed-in, entitled users (see RootView). Hosts
//  the primary optimization thread, the threads drawer and settings.
//

import SwiftUI
import UIKit
import StoreKit

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(AuthManager.self) private var authManager
    @Environment(SettingsManager.self) private var settings
    @Environment(PromptHistoryManager.self) private var historyManager

    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @State private var deeplinkManager = DeeplinkManager.shared
    @State private var homeThreadViewModel = ThreadViewModel()
    @State private var chatViewModel = ChatViewModel()
    @State private var chatListViewModel = ConversationListViewModel()
    @AppStorage("primarySurface") private var surface: AppSurface = .optimize
    @AppStorage("chatConversationId") private var chatConversationId = ""

    @State private var showProfile = false
    @State private var showSubscription = false
    @State private var showWhatsNew = false
    @State private var didHydrateHomeThread = false
    @State private var lastObservedTurnCount = 0

    @AppStorage("homeThreadId") private var homeThreadId = ""
    @State private var backgroundedAt: Date?
    @AppStorage("lastSeenWhatsNewVersion") private var lastSeenWhatsNewVersion = ""
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
        .task {
            await restoreChatConversation()
        }
        .onChange(of: chatViewModel.conversation?.id) { _, newId in
            chatConversationId = newId ?? ""
        }
        .onAppear {
            checkWhatsNew()
        }
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhaseChange(newPhase)
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
                primaryContent
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
                        surface: surface,
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
                        onDismiss: { closeSidebar() },
                        chatList: { chatConversationList }
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
            .sheet(isPresented: $showSubscription, content: subscriptionSheet)
            .sheet(isPresented: $showWhatsNew, content: whatsNewSheet)
            .overlay(alignment: .top) {
                OfflineBanner()
                    .animation(.spring(response: 0.3), value: networkMonitor.isConnected)
            }
        }
    }

    /// The main surface: the prompt optimizer or the assistant chat, chosen
    /// by the mode switch that sits centered in both surfaces' header row.
    /// The drawer, sheets and deeplink handling around it are shared.
    private var primaryContent: some View {
        ZStack(alignment: .top) {
            switch surface {
            case .optimize:
                ThreadView(
                    viewModel: homeThreadViewModel,
                    presentationStyle: .home,
                    onOpenThreads: { openSidebar() },
                    onOpenProfile: { showProfile = true },
                    onOpenHistory: { openSidebar() },
                    onOpenPaywall: { showSubscription = true },
                    onStartNewConversation: newConversation
                )
                .transition(.opacity)
            case .chat:
                ChatView(
                    viewModel: chatViewModel,
                    onOpenSidebar: { openSidebar() },
                    onOpenProfile: { showProfile = true }
                )
                .transition(.opacity)
            }

            // Same top padding and control height as the surfaces' header rows.
            AppSurfacePicker(selection: $surface)
                .padding(.top, 11)
        }
        .animation(.easeInOut(duration: 0.2), value: surface)
    }

    private var chatConversationList: some View {
        ConversationListView(
            viewModel: chatListViewModel,
            selectedConversationId: chatViewModel.conversation?.id,
            onSelect: { conversationId in
                closeSidebar()
                Task { await chatViewModel.openConversation(id: conversationId) }
            },
            onNewChat: {
                closeSidebar()
                chatViewModel.startNewConversation()
            },
            onRenamed: { chatViewModel.conversationWasRenamed($0) },
            onDeleted: { chatViewModel.conversationWasDeleted(id: $0) }
        )
    }

    private func openSidebar() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            showSidebar = true
        }
        Task {
            switch surface {
            case .optimize:
                await sidebarThreadViewModel.fetchThreads(refresh: true)
            case .chat:
                await chatListViewModel.refresh()
            }
        }
    }

    // MARK: - Chat

    private func restoreChatConversation() async {
        chatViewModel.listSync = chatListViewModel
        guard !chatConversationId.isEmpty, chatViewModel.conversation == nil else { return }
        await chatViewModel.openConversation(id: chatConversationId)
        // Deleted elsewhere: forget it. A network failure keeps it for next launch.
        if chatViewModel.conversation == nil, case .idle = chatViewModel.loadState {
            chatConversationId = ""
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
        showSubscription = true
        deeplinkManager.clearPaywallTrigger()
    }

    private func handleEnhanceDeeplink(_ shouldOpen: Bool) {
        guard shouldOpen else { return }
        deeplinkManager.clearEnhanceTrigger()
    }

    @ViewBuilder
    private func profileSheet() -> some View {
        ProfileView()
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(24)
    }

    @ViewBuilder
    private func subscriptionSheet() -> some View {
        PaywallView(mode: .manage)
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

    /// Something is already on screen (a sheet or the drawer) or a reply is
    /// still streaming.
    private var isBusyOrPresenting: Bool {
        showProfile || showSubscription || showWhatsNew || showSidebar
            || homeThreadViewModel.isStreaming || chatViewModel.isStreaming
    }

    /// Single gate for every popup the app shows on its own (What's New,
    /// the notification prompt, the review prompt). It allows one per app
    /// session and never stacks one on top of another sheet.
    private func presentAutomatically(after delay: TimeInterval, _ present: @escaping () -> Void) {
        guard !didAutoPresentThisSession else { return }
        Task {
            try? await Task.sleep(for: .seconds(delay))
            guard !didAutoPresentThisSession, !isBusyOrPresenting else { return }
            didAutoPresentThisSession = true
            present()
        }
    }

    /// After a result arrives, ask for at most one thing: notifications
    /// (first result ever), otherwise an App Store review (later, rarely).
    private func handleSuccessfulResult() {
        guard authManager.isAuthenticated else { return }

        if !didAskNotificationPermission {
            presentAutomatically(after: 1.5) {
                didAskNotificationPermission = true
                Task { _ = await NotificationManager.shared.requestAuthorization() }
            }
            return
        }

        checkReviewPrompt()
    }

    // MARK: - Review Prompt

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

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
        .environment(GuestSessionManager.shared)
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
