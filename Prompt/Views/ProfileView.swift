//
//  ProfileView.swift
//  Prompt
//
//  User profile with account management and statistics
//

import SwiftUI

struct ProfileView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(\.dismiss) private var dismiss

    @State private var showSignOutAlert = false
    @State private var showDeleteAccountAlert = false
    @State private var stats: UserStats?
    @State private var isLoadingStats = false

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
                                Text(user.email)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)

                                if user.isPremium {
                                    Label("Premium", systemImage: "crown.fill")
                                        .font(.caption)
                                        .foregroundStyle(.yellow)
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    }
                }

                // Stats section
                Section("Statistics") {
                    if isLoadingStats {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else if let stats = stats {
                        LabeledContent("Total Prompts", value: "\(stats.totalPrompts)")
                        LabeledContent("Favorite Prompts", value: "\(stats.favoritePrompts)")
                        LabeledContent("Total Tokens Used", value: formatTokens(stats.totalTokens))
                        LabeledContent("Member Since", value: stats.memberSince, format: .dateTime.month().year())
                    }
                }

                // Settings section
                Section("Account") {
                    NavigationLink {
                        SessionsView()
                    } label: {
                        Label("Active Sessions", systemImage: "iphone.and.arrow.forward")
                    }

                    Button(role: .destructive) {
                        showSignOutAlert = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }

                    Button(role: .destructive) {
                        showDeleteAccountAlert = true
                    } label: {
                        Label("Delete Account", systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                }

                // App info
                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    LabeledContent("Build", value: "1")

                    Link(destination: URL(string: "https://example.com/support")!) {
                        Label("Help & Support", systemImage: "questionmark.circle")
                    }

                    Link(destination: URL(string: "https://example.com/privacy")!) {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
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
        }
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(Color(uiColor: .systemGray4))
            .frame(width: 60, height: 60)
            .overlay {
                Image(systemName: "person.fill")
                    .font(.title)
                    .foregroundStyle(.white)
            }
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
    @State private var sessions: [SessionInfo] = []
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else {
                ForEach(sessions) { session in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(session.deviceName ?? "Unknown Device")
                                    .font(.headline)

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
                                .foregroundStyle(.secondary)
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
                }
            }
        }
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
}
