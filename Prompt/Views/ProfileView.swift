//
//  ProfileView.swift
//  Prompt
//
//  User profile with account management, editing, and statistics
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct ProfileView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(SettingsManager.self) private var settings
    @Environment(\.dismiss) private var dismiss

    @State private var showSignOutAlert = false
    @State private var showDeleteAccountAlert = false
    @State private var showPaywall = false
    @State private var stats: UserStats?
    @State private var isLoadingStats = false

    // Profile editing
    @State private var isEditingProfile = false
    @State private var editName: String = ""
    @State private var editCustomInstructions: String = ""
    @State private var isSavingProfile = false
    @State private var profileSaveError: String?

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    // App version from bundle
    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

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
                                if isEditingProfile {
                                    TextField("Name", text: $editName)
                                        .font(.headline)
                                        .foregroundStyle(textPrimary)
                                        .textFieldStyle(.plain)
                                } else {
                                    Text(user.name ?? "User")
                                        .font(.headline)
                                        .foregroundStyle(textPrimary)
                                }
                                Text(user.email)
                                    .font(.subheadline)
                                    .foregroundStyle(textSecondary)

                                if user.isPremium {
                                    Label("Premium", systemImage: "crown.fill")
                                        .font(.caption)
                                        .foregroundStyle(accentColor)
                                }
                            }
                        }
                        .padding(.vertical, 8)
                        .listRowBackground(bgSecondary)
                    }
                }

                // Custom Instructions section (editable)
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Label("Custom Instructions", systemImage: "text.bubble.fill")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(textPrimary)
                            Spacer()
                        }

                        if isEditingProfile {
                            TextEditor(text: $editCustomInstructions)
                                .frame(minHeight: 80)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .scrollContentBackground(.hidden)
                                .padding(8)
                                .liquidGlassInput(cornerRadius: 10, isFocused: true)
                        } else {
                            let instructions = settings.customInstructions
                            Text(instructions.isEmpty ? "No custom instructions set" : instructions)
                                .font(.subheadline)
                                .foregroundStyle(instructions.isEmpty ? textTertiary : textSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if let error = profileSaveError {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                        }
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Personalization")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Instructions included with every prompt enhancement.")
                        .foregroundStyle(textTertiary)
                }

                // Subscription section
                Section {
                    VStack(spacing: 16) {
                        SubscriptionStatusCard()

                        if storeKit.currentTier != .premium {
                            Button {
                                showPaywall = true
                            } label: {
                                HStack {
                                    Image(systemName: storeKit.currentTier == .free ? "crown.fill" : "arrow.up.circle.fill")
                                        .foregroundStyle(accentColor)
                                    Text(storeKit.currentTier == .free ? "Upgrade to Premium" : "Upgrade Plan")
                                        .foregroundStyle(textPrimary)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(textTertiary)
                                }
                            }
                        }

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
                                .tint(accentColor)
                            Spacer()
                        }
                        .listRowBackground(bgSecondary)
                    } else if let stats = stats {
                        statsRow(label: "Total Prompts", value: "\(stats.totalPrompts)")
                        statsRow(label: "Starred Prompts", value: "\(stats.favoritePrompts)")
                        statsRow(label: "Total Tokens Used", value: formatTokens(stats.totalTokens))
                        statsRow(label: "Member Since", value: stats.memberSince.formatted(.dateTime.month().year()))
                    }
                } header: {
                    Text("Statistics")
                        .foregroundStyle(textSecondary)
                }

                // Account section
                Section {
                    Button(role: .destructive) {
                        showSignOutAlert = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .listRowBackground(bgSecondary)

                    Button(role: .destructive) {
                        showDeleteAccountAlert = true
                    } label: {
                        Label("Delete Account", systemImage: "trash.fill")
                            .foregroundStyle(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Account")
                        .foregroundStyle(textSecondary)
                }

                // App info
                Section {
                    statsRow(label: "Version", value: appVersion)
                    statsRow(label: "Build", value: buildNumber)

                    Link(destination: URL(string: "https://promptomize.app/support")!) {
                        HStack {
                            Label("Help & Support", systemImage: "questionmark.circle.fill")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(textTertiary)
                        }
                    }
                    .listRowBackground(bgSecondary)

                    Link(destination: URL(string: "https://promptomize.app/privacy")!) {
                        HStack {
                            Label("Privacy Policy", systemImage: "hand.raised.fill")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(textTertiary)
                        }
                    }
                    .listRowBackground(bgSecondary)

                    Link(destination: URL(string: "https://promptomize.app/terms")!) {
                        HStack {
                            Label("Terms of Service", systemImage: "doc.text.fill")
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
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if isEditingProfile {
                        Button("Cancel") {
                            isEditingProfile = false
                            profileSaveError = nil
                        }
                        .foregroundStyle(textSecondary)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if isEditingProfile {
                        Button {
                            Task { await saveProfile() }
                        } label: {
                            if isSavingProfile {
                                ProgressView()
                                    .tint(accentColor)
                            } else {
                                Text("Save")
                                    .fontWeight(.semibold)
                                    .foregroundStyle(accentColor)
                            }
                        }
                        .disabled(isSavingProfile)
                    } else {
                        Menu {
                            Button {
                                startEditing()
                            } label: {
                                Label("Edit Profile", systemImage: "pencil")
                            }
                            Button("Done") {
                                dismiss()
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle.fill")
                                .foregroundStyle(accentColor)
                        }
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

    // MARK: - Profile Editing

    private func startEditing() {
        editName = authManager.currentUser?.name ?? ""
        editCustomInstructions = settings.customInstructions
        profileSaveError = nil
        isEditingProfile = true
    }

    private func saveProfile() async {
        isSavingProfile = true
        profileSaveError = nil

        do {
            // Save to backend
            let nameToSave = editName.trimmingCharacters(in: .whitespacesAndNewlines)
            let instructionsToSave = editCustomInstructions.trimmingCharacters(in: .whitespacesAndNewlines)

            try await authManager.updateProfile(
                name: nameToSave.isEmpty ? nil : nameToSave,
                customInstructions: instructionsToSave.isEmpty ? nil : instructionsToSave
            )

            // Sync custom instructions to local settings
            settings.customInstructions = instructionsToSave
            settings.savePreferences()

            isEditingProfile = false
        } catch {
            profileSaveError = error.localizedDescription
        }

        isSavingProfile = false
    }

    // MARK: - Data Loading

    private func loadStats() async {
        isLoadingStats = true
        defer { isLoadingStats = false }

        do {
            let response: StatsResponse = try await APIClient.shared.request("/users/stats")
            stats = response.stats
        } catch {
            #if DEBUG
            print("Failed to load stats: \(error)")
            #endif
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

#Preview {
    ProfileView()
        .environment(AuthManager.shared)
        .environment(PromptHistoryManager.shared)
        .environment(StoreKitManager.shared)
        .environment(SettingsManager())
}
