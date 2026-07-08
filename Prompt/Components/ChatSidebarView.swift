//
//  ChatSidebarView.swift
//  Prompt
//
//  Left-sliding sidebar drawer showing chat history, search, and user profile.
//  Left-sliding sidebar drawer for chat navigation.
//

import SwiftUI

struct ChatSidebarView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager
    @Environment(GuestSessionManager.self) private var guestSession
    @Environment(StoreKitManager.self) private var storeKit

    @Bindable var threadViewModel: ThreadViewModel
    let onSelectThread: (String) -> Void
    let onNewChat: () -> Void
    let onOpenSettings: () -> Void
    let onDismiss: () -> Void

    @State private var searchText = ""

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private var filteredThreads: [ThreadRecord] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return threadViewModel.threads }
        let query = trimmed.localizedLowercase
        return threadViewModel.threads.filter { thread in
            thread.title.localizedLowercase.contains(query) ||
            (thread.lastPreview?.localizedLowercase.contains(query) ?? false)
        }
    }

    /// Either signal means the stored session is no longer valid: the fetch
    /// short-circuit (`threadListState`) or APIClient's terminal refresh
    /// failure propagated through AuthManager.
    private var isSessionExpired: Bool {
        threadViewModel.threadListState == .sessionExpired || authManager.isSessionExpired
    }

    var body: some View {
        VStack(spacing: 0) {
            // Search bar + new chat button
            HStack(spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(textTertiary)

                    TextField("Search", text: $searchText)
                        .font(.system(.body, design: .rounded))
                        .foregroundStyle(textPrimary)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.adaptiveBackgroundTertiary.opacity(colorScheme == .dark ? 1 : 0.6))
                }

                Button(action: {
                    triggerHaptic(.light)
                    onNewChat()
                }) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(textPrimary)
                        .frame(width: 42, height: 42)
                        .background {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(Color.adaptiveBackgroundTertiary.opacity(colorScheme == .dark ? 1 : 0.6))
                        }
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)

            // Thread list - simple text rows
            if threadViewModel.isLoadingThreads && threadViewModel.threads.isEmpty {
                Spacer()
                ProgressView()
                    .tint(accentColor)
                Spacer()
            } else if isSessionExpired {
                statusState(
                    icon: "person.crop.circle.badge.exclamationmark",
                    title: "Session expired",
                    message: "Your chats are still saved. Sign in again to see them.",
                    actionTitle: "Sign In Again"
                ) {
                    guestSession.presentAuthenticationGate()
                    onDismiss()
                }
            } else if case .failed(let message) = threadViewModel.threadListState, threadViewModel.threads.isEmpty {
                statusState(
                    icon: "wifi.exclamationmark",
                    title: "Couldn't load chats",
                    message: message,
                    actionTitle: "Retry"
                ) {
                    Task { await threadViewModel.fetchThreads(refresh: true) }
                }
            } else if threadViewModel.threadListState == .idle, !authManager.isAuthenticated {
                statusState(
                    icon: "person.crop.circle",
                    title: "Sign in to see your chats",
                    message: "Chats sync to your account once you sign in.",
                    actionTitle: "Sign In"
                ) {
                    guestSession.presentAuthenticationGate()
                    onDismiss()
                }
            } else if filteredThreads.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    if threadViewModel.threadListState == .loaded || !searchText.isEmpty {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 32, weight: .light))
                            .foregroundStyle(textTertiary)
                        // "No chats yet" only after the server confirmed an empty list
                        Text(searchText.isEmpty ? "No chats yet" : "No results")
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .foregroundStyle(textSecondary)
                    } else {
                        // .idle while signed in: the fetch kicks off on appearance
                        ProgressView()
                            .tint(accentColor)
                    }
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredThreads) { thread in
                            sidebarThreadRow(thread)
                        }

                        if threadViewModel.hasMorePages && searchText.isEmpty {
                            ProgressView()
                                .tint(accentColor)
                                .padding(.vertical, 16)
                                .task {
                                    threadViewModel.currentPage += 1
                                    await threadViewModel.fetchThreads()
                                }
                        }
                    }
                }
                .scrollDismissesKeyboard(.interactively)
            }

            Spacer(minLength: 0)

            // User profile at bottom
            userProfileRow
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.adaptiveBackgroundPrimary)
        .task {
            if authManager.isAuthenticated {
                await threadViewModel.fetchThreads(refresh: true)
            }
        }
    }

    // MARK: - Status States

    @ViewBuilder
    private func statusState(
        icon: String,
        title: String,
        message: String,
        actionTitle: String,
        action: @escaping () -> Void
    ) -> some View {
        Spacer()
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(textTertiary)

            VStack(spacing: 4) {
                Text(title)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text(message)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 24)

            Button {
                triggerHaptic(.light)
                action()
            } label: {
                Text(actionTitle)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background {
                        Capsule()
                            .fill(Color.adaptiveBackgroundTertiary.opacity(colorScheme == .dark ? 1 : 0.6))
                    }
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        Spacer()
    }

    // MARK: - Thread Row

    private func sidebarThreadRow(_ thread: ThreadRecord) -> some View {
        Button {
            triggerHaptic(.light)
            onSelectThread(thread.id)
        } label: {
            Text(thread.title)
                .font(.system(.body, design: .rounded, weight: .regular))
                .foregroundStyle(textPrimary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task {
                    await threadViewModel.deleteThread(id: thread.id)
                }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .contextMenu {
            Button(role: .destructive) {
                Task {
                    await threadViewModel.deleteThread(id: thread.id)
                }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - User Profile

    private var userProfileRow: some View {
        Button {
            triggerHaptic(.light)
            onOpenSettings()
        } label: {
            HStack(spacing: 12) {
                userAvatar
                    .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(authManager.currentUser?.email ?? "Guest")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(textPrimary)
                        .lineLimit(1)

                    Text(subscriptionLabel)
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(subscriptionColor)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.adaptiveBorder.opacity(0.3))
                .frame(height: 0.5)
        }
    }

    private var subscriptionLabel: String {
        storeKit.currentTier.displayName
    }

    private var subscriptionColor: Color {
        switch storeKit.currentTier {
        case .premium: return .orange
        case .pro: return accentColor
        case .free: return textTertiary
        }
    }

    private var userAvatar: some View {
        Group {
            if let avatarUrl = authManager.currentUser?.avatarUrl,
               let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    initialsAvatar
                }
                .clipShape(Circle())
            } else {
                initialsAvatar
            }
        }
    }

    private var initialsAvatar: some View {
        let name = authManager.currentUser?.name ?? authManager.currentUser?.email ?? "G"
        let initial = String(name.prefix(1)).uppercased()

        return Circle()
            .fill(Color(red: 0.35, green: 0.55, blue: 0.82))
            .overlay {
                Text(initial)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
    }

    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}
