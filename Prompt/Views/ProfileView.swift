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
    @Environment(GuestSessionManager.self) private var guestSession
    @Environment(PromptHistoryManager.self) private var historyManager
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(SettingsManager.self) private var settings
    @Environment(\.dismiss) private var dismiss

    @StateObject private var unreadManager = UnreadMessageManager.shared
    @State private var showSignOutAlert = false
    @State private var showDeleteAccountAlert = false
    @State private var showPaywall = false
    @State private var showSupport = false
    @State private var stats: UserStats?
    @State private var isLoadingStats = false

    // Profile editing
    @State private var isEditingProfile = false
    @State private var editName: String = ""
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
        @Bindable var bindableSettings = settings

        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                VStack(spacing: 0) {
                    // Settings header: title centered, X close button top-right
                    HStack {
                        Spacer()

                        Text("Settings")
                            .font(.system(.headline, design: .rounded, weight: .bold))
                            .foregroundStyle(textPrimary)

                        Spacer()
                    }
                    .overlay(alignment: .trailing) {
                        Button {
                            if isEditingProfile {
                                isEditingProfile = false
                                profileSaveError = nil
                            } else {
                                dismiss()
                            }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(textSecondary)
                                .frame(width: 32, height: 32)
                                .background {
                                    Circle()
                                        .fill(Color.adaptiveBackgroundTertiary)
                                }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 8)

                    List {
                // Centered profile header
                Section {
                    VStack(spacing: 12) {
                        // Large centered avatar
                        settingsAvatar
                            .frame(width: 90, height: 90)

                        if let user = authManager.currentUser {
                            if isEditingProfile {
                                TextField("Name", text: $editName)
                                    .font(.system(.title2, design: .rounded, weight: .bold))
                                    .foregroundStyle(textPrimary)
                                    .multilineTextAlignment(.center)
                                    .textFieldStyle(.plain)
                            } else {
                                Text(user.name ?? user.email)
                                    .font(.system(.title2, design: .rounded, weight: .bold))
                                    .foregroundStyle(textPrimary)

                                Text(user.email)
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textSecondary)
                            }

                            // Edit profile button
                            if !isEditingProfile {
                                Button {
                                    startEditing()
                                } label: {
                                    Text("Edit profile")
                                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                                        .foregroundStyle(textPrimary)
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 8)
                                        .background {
                                            Capsule()
                                                .stroke(Color.adaptiveBorder, lineWidth: 1)
                                        }
                                }
                                .buttonStyle(.plain)
                            } else {
                                Button {
                                    Task { await saveProfile() }
                                } label: {
                                    if isSavingProfile {
                                        ProgressView()
                                            .tint(accentColor)
                                    } else {
                                        Text("Save")
                                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                            .foregroundStyle(Color.adaptiveTextOnAccent)
                                            .padding(.horizontal, 20)
                                            .padding(.vertical, 8)
                                            .background {
                                                Capsule()
                                                    .fill(accentColor)
                                            }
                                    }
                                }
                                .buttonStyle(.plain)
                                .disabled(isSavingProfile)
                            }
                        } else {
                            Text("Guest")
                                .font(.system(.title2, design: .rounded, weight: .bold))
                                .foregroundStyle(textPrimary)

                            Button {
                                guestSession.presentAuthenticationGate()
                                dismiss()
                            } label: {
                                Label("Sign In with Apple", systemImage: "apple.logo")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(Color.adaptiveTextOnAccent)
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 10)
                                    .background {
                                        Capsule()
                                            .fill(accentColor)
                                    }
                            }
                            .buttonStyle(.plain)
                        }

                        if let error = profileSaveError {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }

                // Account section
                Section {
                    if let user = authManager.currentUser {
                        settingsRow(icon: "envelope.fill", iconColor: accentColor, title: "Email", value: user.email)
                    }

                    settingsRow(
                        icon: "plus.rectangle.on.rectangle",
                        iconColor: accentColor,
                        title: "Subscription",
                        value: storeKit.currentTier.displayName
                    )

                    Button {
                        handlePlanAction()
                    } label: {
                        settingsRowContent(
                            icon: "diamond.fill",
                            iconColor: accentColor,
                            title: "Upgrade to Premium",
                            showChevron: false
                        )
                    }
                    .listRowBackground(bgSecondary)

                    Button {
                        Task { try? await storeKit.restorePurchases() }
                    } label: {
                        settingsRowContent(
                            icon: "arrow.clockwise",
                            iconColor: textSecondary,
                            title: "Restore purchases",
                            showChevron: false
                        )
                    }
                    .listRowBackground(bgSecondary)

                    if storeKit.isTrialing, let remaining = storeKit.subscriptionInfo?.trialDaysRemaining {
                        settingsRow(icon: "clock.fill", iconColor: .orange, title: "Trial", value: "\(remaining) days left")
                    }
                } header: {
                    Text("Account")
                        .foregroundStyle(textSecondary)
                }

                // Preferences section
                Section {
                    Picker(selection: $bindableSettings.appearanceMode) {
                        ForEach(AppearanceMode.allCases) { mode in
                            HStack {
                                Image(systemName: mode.icon)
                                Text(mode.displayName)
                            }
                            .tag(mode)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "paintbrush.fill")
                                .foregroundStyle(accentColor)
                                .frame(width: 28)
                            Text("Appearance")
                                .foregroundStyle(textPrimary)
                        }
                    }
                    .pickerStyle(.menu)
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Preferences")
                        .foregroundStyle(textSecondary)
                }

                Section {
                    HStack {
                        Image(systemName: "thermometer.medium")
                            .foregroundStyle(accentColor)
                            .frame(width: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Temperature")
                                .foregroundStyle(textPrimary)
                            Text(String(format: "%.1f", settings.temperature))
                                .font(.caption)
                                .foregroundStyle(textSecondary)
                        }
                        Spacer()
                        Slider(value: $bindableSettings.temperature, in: 0...1.5, step: 0.1)
                            .frame(width: 150)
                            .tint(accentColor)
                    }
                    .listRowBackground(bgSecondary)

                    HStack {
                        Image(systemName: "number.square.fill")
                            .foregroundStyle(accentColor)
                            .frame(width: 28)
                        Stepper("Max Tokens: \(settings.maxTokens)", value: $bindableSettings.maxTokens, in: 1024...65536, step: 1024)
                            .foregroundStyle(textPrimary)
                    }
                    .listRowBackground(bgSecondary)

                } header: {
                    Text("Generation")
                        .foregroundStyle(textSecondary)
                }

                Section {
                    NavigationLink {
                        AnalyticsView()
                    } label: {
                        settingsRowContent(
                            icon: "chart.bar.fill",
                            iconColor: accentColor,
                            title: "Analytics",
                            showChevron: false
                        )
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Insights")
                        .foregroundStyle(textSecondary)
                }

                Section {
                    Button {
                        showSupport = true
                        unreadManager.markAllAsRead()
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                                .foregroundStyle(accentColor)
                                .frame(width: 28)

                            Text("Contact Support")
                                .foregroundStyle(textPrimary)

                            Spacer()

                            if unreadManager.hasUnreadMessages {
                                Text("New")
                                    .font(.system(.caption2, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color(red: 255/255, green: 69/255, blue: 58/255))
                                    .clipShape(Capsule())
                            }

                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(textTertiary)
                        }
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Help")
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
                        settingsRow(icon: "text.bubble.fill", iconColor: accentColor, title: "Total Prompts", value: "\(stats.totalPrompts)")
                        settingsRow(icon: "star.fill", iconColor: .orange, title: "Starred", value: "\(stats.favoritePrompts)")
                        settingsRow(icon: "number", iconColor: .green, title: "Tokens Used", value: formatTokens(stats.totalTokens))
                        settingsRow(icon: "calendar", iconColor: .blue, title: "Member Since", value: stats.memberSince.formatted(.dateTime.month().year()))
                    }
                } header: {
                    Text("Statistics")
                        .foregroundStyle(textSecondary)
                }

                // Sign out / danger
                Section {
                    Button(role: .destructive) {
                        showSignOutAlert = true
                    } label: {
                        settingsRowContent(
                            icon: "rectangle.portrait.and.arrow.right",
                            iconColor: textSecondary,
                            title: "Sign Out",
                            showChevron: false
                        )
                    }
                    .listRowBackground(bgSecondary)

                    Button(role: .destructive) {
                        showDeleteAccountAlert = true
                    } label: {
                        settingsRowContent(
                            icon: "trash.fill",
                            iconColor: colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25),
                            title: "Delete Account",
                            showChevron: false
                        )
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Account Actions")
                        .foregroundStyle(textSecondary)
                }

                // App info
                Section {
                    statsRow(label: "Version", value: appVersion)
                    statsRow(label: "Build", value: buildNumber)
                    statsRow(label: "Powered By", value: "DeepSeek AI")

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
            }
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: settings.appearanceMode) { _, _ in
                settings.savePreferences()
            }
            .onChange(of: settings.temperature) { _, _ in
                settings.savePreferences()
            }
            .onChange(of: settings.maxTokens) { _, _ in
                settings.savePreferences()
            }
            .preferredColorScheme(settings.appearanceMode.colorScheme)
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
            .sheet(isPresented: $showSupport) {
                SupportView()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(24)
            }
        }
    }

    // MARK: - Settings Avatar (centered, large, with initials)

    private var settingsAvatar: some View {
        Group {
            if let avatarUrl = authManager.currentUser?.avatarUrl,
               let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    initialsCircle
                }
                .clipShape(Circle())
            } else {
                initialsCircle
            }
        }
    }

    private var initialsCircle: some View {
        let name = authManager.currentUser?.name ?? authManager.currentUser?.email ?? "G"
        let initials = String(name.prefix(2)).uppercased()

        return Circle()
            .fill(Color(red: 0.35, green: 0.55, blue: 0.82))
            .overlay {
                Text(initials)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
    }

    // MARK: - Settings Row Helpers

    private func settingsRow(icon: String, iconColor: Color, title: String, value: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .foregroundStyle(iconColor)
                .frame(width: 28)

            Text(title)
                .foregroundStyle(textPrimary)

            Spacer()

            Text(value)
                .foregroundStyle(textSecondary)
        }
        .listRowBackground(bgSecondary)
    }

    private func settingsRowContent(icon: String, iconColor: Color, title: String, showChevron: Bool) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .foregroundStyle(iconColor)
                .frame(width: 28)

            Text(title)
                .foregroundStyle(textPrimary)

            Spacer()

            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(textTertiary)
            }
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
        profileSaveError = nil
        isEditingProfile = true
    }

    private func saveProfile() async {
        isSavingProfile = true
        profileSaveError = nil

        do {
            // Save to backend
            let nameToSave = editName.trimmingCharacters(in: .whitespacesAndNewlines)

            try await authManager.updateProfile(
                name: nameToSave.isEmpty ? nil : nameToSave
            )

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

    private func handlePlanAction() {
        showPaywall = true
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
