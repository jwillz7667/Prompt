//
//  ProfileView.swift
//  Prompt
//
//  User profile with account management and statistics
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct ProfileView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(\.dismiss) private var dismiss

    @State private var showSignOutAlert = false
    @State private var showDeleteAccountAlert = false
    @State private var showPaywall = false
    @State private var stats: UserStats?
    @State private var isLoadingStats = false

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        NavigationStack {
            List {
                // User info section
                if let user = authManager.currentUser {
                    Section {
                        HStack(spacing: 16) {
                            // Avatar
                            if let avatarUrl = user.avatarUrl, let url = URL(string: avatarUrl) {
                                AsyncImage(url: url) { image in
                                    image
                                        .resizable()
                                        .scaledToFill()
                                } placeholder: {
                                    avatarPlaceholder
                                }
                                .frame(width: 60, height: 60)
                                .clipShape(Circle())
                            } else {
                                avatarPlaceholder
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                Text(user.name ?? "User")
                                    .font(.headline)
                                    .foregroundStyle(textPrimary)
                                Text(user.email)
                                    .font(.subheadline)
                                    .foregroundStyle(textSecondary)

                                if user.isPremium {
                                    Label("Premium", systemImage: "crown.fill")
                                        .font(.caption)
                                        .foregroundStyle(.yellow)
                                }
                            }
                        }
                        .padding(.vertical, 8)
                        .listRowBackground(bgSecondary)
                    }
                }

                // Subscription section
                Section {
                    VStack(spacing: 16) {
                        SubscriptionStatusCard()

                        // Show upgrade button for non-premium users
                        if storeKit.currentTier != .premium {
                            Button {
                                showPaywall = true
                            } label: {
                                HStack {
                                    Image(systemName: storeKit.currentTier == .free ? "crown.fill" : "arrow.up.circle.fill")
                                        .foregroundStyle(storeKit.currentTier == .free ? .purple : .blue)
                                    Text(storeKit.currentTier == .free ? "Upgrade to Premium" : "Upgrade Plan")
                                        .foregroundStyle(textPrimary)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(textTertiary)
                                }
                            }
                        }

                        // Trial banner
                        if storeKit.isTrialing, let remaining = storeKit.subscriptionInfo?.trialDaysRemaining {
                            TrialBanner(daysRemaining: remaining) {
                                showPaywall = true
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Subscription")
                        .foregroundStyle(textSecondary)
                }

                // Stats section
                Section {
                    if isLoadingStats {
                        HStack {
                            Spacer()
                            ProgressView()
                                .tint(textPrimary)
                            Spacer()
                        }
                        .listRowBackground(bgSecondary)
                    } else if let stats = stats {
                        statsRow(label: "Total Prompts", value: "\(stats.totalPrompts)")
                        statsRow(label: "Favorite Prompts", value: "\(stats.favoritePrompts)")
                        statsRow(label: "Total Tokens Used", value: formatTokens(stats.totalTokens))
                        statsRow(label: "Member Since", value: stats.memberSince.formatted(.dateTime.month().year()))
                    }
                } header: {
                    Text("Statistics")
                        .foregroundStyle(textSecondary)
                }

                // Settings section
                Section {
                    NavigationLink {
                        SessionsView()
                    } label: {
                        Label("Active Sessions", systemImage: "iphone.and.arrow.forward")
                            .foregroundStyle(textPrimary)
                    }
                    .listRowBackground(bgSecondary)

                    Button(role: .destructive) {
                        showSignOutAlert = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .listRowBackground(bgSecondary)

                    Button(role: .destructive) {
                        showDeleteAccountAlert = true
                    } label: {
                        Label("Delete Account", systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Account")
                        .foregroundStyle(textSecondary)
                }

                // App info
                Section {
                    statsRow(label: "Version", value: "1.0.0")
                    statsRow(label: "Build", value: "1")

                    Link(destination: URL(string: "https://promptomize.app/support")!) {
                        HStack {
                            Label("Help & Support", systemImage: "questionmark.circle")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(textTertiary)
                        }
                    }
                    .listRowBackground(bgSecondary)

                    Link(destination: URL(string: "https://promptomize.app/privacy")!) {
                        HStack {
                            Label("Privacy Policy", systemImage: "hand.raised")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(textTertiary)
                        }
                    }
                    .listRowBackground(bgSecondary)

                    Link(destination: URL(string: "https://promptomize.app/terms")!) {
                        HStack {
                            Label("Terms of Service", systemImage: "doc.text")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(textTertiary)
                        }
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("About")
                        .foregroundStyle(textSecondary)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(bgPrimary.ignoresSafeArea())
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                }
            }
            .task {
                await loadStats()
            }
            .alert("Sign Out", isPresented: $showSignOutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {
                    Task {
                        await authManager.signOut()
                        historyManager.clearLocalData()
                        dismiss()
                    }
                }
            } message: {
                Text("Are you sure you want to sign out?")
            }
            .alert("Delete Account", isPresented: $showDeleteAccountAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        try? await deleteAccount()
                    }
                }
            } message: {
                Text("This will permanently delete your account and all data. This action cannot be undone.")
            }
            .sheet(isPresented: $showPaywall) {
                PaywallView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
        }
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(bgSecondary)
            .frame(width: 60, height: 60)
            .overlay {
                Image(systemName: "person.fill")
                    .font(.title)
                    .foregroundStyle(textSecondary)
            }
    }

    @ViewBuilder
    private func statsRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(textPrimary)
            Spacer()
            Text(value)
                .foregroundStyle(textSecondary)
        }
        .listRowBackground(bgSecondary)
    }

    private func loadStats() async {
        isLoadingStats = true
        defer { isLoadingStats = false }

        do {
            let response: StatsResponse = try await APIClient.shared.request("/users/stats")
            stats = response.stats
        } catch {
            print("Failed to load stats: \(error)")
        }
    }

    private func deleteAccount() async throws {
        try await APIClient.shared.requestVoid("/users/account", method: .delete)
        await APIClient.shared.clearTokens()
        authManager.currentUser = nil
        historyManager.clearLocalData()
        dismiss()
    }

    private func formatTokens(_ tokens: String) -> String {
        guard let value = Int(tokens) else { return tokens }
        if value >= 1_000_000 {
            return String(format: "%.1fM", Double(value) / 1_000_000)
        } else if value >= 1_000 {
            return String(format: "%.1fK", Double(value) / 1_000)
        }
        return "\(value)"
    }
}

// MARK: - Stats Models

struct UserStats: Decodable {
    let totalPrompts: Int
    let favoritePrompts: Int
    let totalTokens: String
    let memberSince: Date
    let isPremium: Bool
    let premiumUntil: Date?

    enum CodingKeys: String, CodingKey {
        case totalPrompts, favoritePrompts, totalTokens, memberSince, isPremium, premiumUntil
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        totalPrompts = try container.decode(Int.self, forKey: .totalPrompts)
        favoritePrompts = try container.decode(Int.self, forKey: .favoritePrompts)
        totalTokens = try container.decode(String.self, forKey: .totalTokens)

        let dateString = try container.decode(String.self, forKey: .memberSince)
        memberSince = ISO8601DateFormatter().date(from: dateString) ?? Date()

        isPremium = try container.decode(Bool.self, forKey: .isPremium)
        if let premiumString = try container.decodeIfPresent(String.self, forKey: .premiumUntil) {
            premiumUntil = ISO8601DateFormatter().date(from: premiumString)
        } else {
            premiumUntil = nil
        }
    }
}

struct StatsResponse: Decodable {
    let stats: UserStats
}

// MARK: - Sessions View

struct SessionsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var sessions: [SessionInfo] = []
    @State private var isLoading = true

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        List {
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(textPrimary)
                    Spacer()
                }
                .listRowBackground(bgSecondary)
            } else {
                ForEach(sessions) { session in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(session.deviceName ?? "Unknown Device")
                                    .font(.headline)
                                    .foregroundStyle(textPrimary)

                                if session.isCurrent {
                                    Text("Current")
                                        .font(.caption)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(.green.opacity(0.2))
                                        .foregroundStyle(.green)
                                        .clipShape(Capsule())
                                }
                            }

                            Text("Last active: \(session.lastActiveAt, style: .relative)")
                                .font(.caption)
                                .foregroundStyle(textSecondary)
                        }

                        Spacer()

                        if !session.isCurrent {
                            Button(role: .destructive) {
                                Task {
                                    await revokeSession(session)
                                }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                    .listRowBackground(bgSecondary)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(bgPrimary.ignoresSafeArea())
        .navigationTitle("Active Sessions")
        .task {
            await loadSessions()
        }
    }

    private func loadSessions() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response: SessionsResponse = try await APIClient.shared.request("/users/sessions")
            sessions = response.sessions
        } catch {
            print("Failed to load sessions: \(error)")
        }
    }

    private func revokeSession(_ session: SessionInfo) async {
        do {
            try await APIClient.shared.requestVoid("/users/sessions/\(session.id)", method: .delete)
            sessions.removeAll { $0.id == session.id }
        } catch {
            print("Failed to revoke session: \(error)")
        }
    }
}

struct SessionInfo: Identifiable, Decodable {
    let id: String
    let deviceName: String?
    let deviceType: String?
    let createdAt: Date
    let lastActiveAt: Date
    let isCurrent: Bool

    enum CodingKeys: String, CodingKey {
        case id, deviceName, deviceType, createdAt, lastActiveAt, isCurrent
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        deviceName = try container.decodeIfPresent(String.self, forKey: .deviceName)
        deviceType = try container.decodeIfPresent(String.self, forKey: .deviceType)
        isCurrent = try container.decode(Bool.self, forKey: .isCurrent)

        let createdString = try container.decode(String.self, forKey: .createdAt)
        createdAt = ISO8601DateFormatter().date(from: createdString) ?? Date()

        let lastActiveString = try container.decode(String.self, forKey: .lastActiveAt)
        lastActiveAt = ISO8601DateFormatter().date(from: lastActiveString) ?? Date()
    }
}

struct SessionsResponse: Decodable {
    let sessions: [SessionInfo]
}

#Preview {
    ProfileView()
        .environment(AuthManager.shared)
        .environment(PromptHistoryManager.shared)
        .environment(StoreKitManager.shared)
}
