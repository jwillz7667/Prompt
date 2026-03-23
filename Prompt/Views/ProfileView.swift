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
        @Bindable var bindableSettings = settings

        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                VStack(spacing: 0) {
                    PromptPageHeader(
                        title: "Account",
                        subtitle: "Profile details, Premium access, and app settings",
                        onLeadingTap: {
                            if isEditingProfile {
                                isEditingProfile = false
                                profileSaveError = nil
                            } else {
                                dismiss()
                            }
                        }
                    ) {
                        Group {
                            if isEditingProfile {
                                Button {
                                    Task { await saveProfile() }
                                } label: {
                                    if isSavingProfile {
                                        ProgressView()
                                            .tint(accentColor)
                                    } else {
                                        Text("Save")
                                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                            .foregroundStyle(textPrimary)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 9)
                                    }
                                }
                                .buttonStyle(GlassCapsuleButtonStyle(tintColor: accentColor))
                                .disabled(isSavingProfile)
                            } else {
                                Menu {
                                    Button {
                                        startEditing()
                                    } label: {
                                        Label("Edit Profile", systemImage: "pencil")
                                    }
                                    Button("Close") {
                                        dismiss()
                                    }
                                } label: {
                                    Image(systemName: "ellipsis")
                                        .font(.system(size: 17, weight: .semibold))
                                        .foregroundStyle(textPrimary)
                                }
                                .buttonStyle(GlassIconButtonStyle(size: 40))
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

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
                } else {
                    Section {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(spacing: 14) {
                                AppBrandMark(size: 54, showsGlassBackdrop: false)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Sign in to sync your account")
                                        .font(.system(.headline, design: .rounded, weight: .semibold))
                                        .foregroundStyle(textPrimary)

                                    Text("Save chat threads, restore purchases, and unlock the 7-day Premium trial offer.")
                                        .font(.system(.subheadline, design: .rounded))
                                        .foregroundStyle(textSecondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }

                            Button {
                                guestSession.presentAuthenticationGate()
                                dismiss()
                            } label: {
                                Label("Sign In with Apple", systemImage: "apple.logo")
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                            }
                            .buttonStyle(LiquidGlassButtonStyle(cornerRadius: 16, tintColor: accentColor, intensity: .prominent))
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(bgSecondary)
                    }
                }

                Section {
                    VStack(alignment: .leading, spacing: 16) {
                        SubscriptionStatusCard()

                        UpgradePromptCard(currentTier: storeKit.currentTier) {
                            handlePlanAction()
                        }

                        if storeKit.isTrialing, let remaining = storeKit.subscriptionInfo?.trialDaysRemaining {
                            TrialBanner(daysRemaining: remaining) {
                                handlePlanAction()
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Premium")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Start the trial, unlock Premium, or restore a past purchase.")
                        .foregroundStyle(textTertiary)
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
                    Text("Appearance")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Choose your preferred color scheme. System follows your device settings.")
                        .foregroundStyle(textTertiary)
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

                    HStack {
                        Image(systemName: "character.cursor.ibeam")
                            .foregroundStyle(accentColor)
                            .frame(width: 28)
                        Text("Target Length")
                            .foregroundStyle(textPrimary)
                        Spacer()

                        if let targetLength = settings.targetCharacterLength {
                            Text("\(targetLength) chars")
                                .font(.caption)
                                .foregroundStyle(textSecondary)
                        }

                        TextField("Optional", value: $bindableSettings.targetCharacterLength, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 100)
                            .multilineTextAlignment(.trailing)
                            .keyboardType(.numberPad)
                    }
                    .listRowBackground(bgSecondary)
                } header: {
                    Text("Generation Settings")
                        .foregroundStyle(textSecondary)
                } footer: {
                    Text("Higher temperature increases exploration. Max tokens and target length shape how much the optimizer can return.")
                        .foregroundStyle(textTertiary)
                }

                Section {
                    NavigationLink {
                        AnalyticsView()
                    } label: {
                        HStack {
                            Image(systemName: "chart.bar.fill")
                                .foregroundStyle(accentColor)
                                .frame(width: 28)
                            Text("Analytics")
                                .foregroundStyle(textPrimary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(textTertiary)
                        }
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
                        HStack {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: "bubble.left.and.bubble.right.fill")
                                    .foregroundStyle(accentColor)
                                    .frame(width: 28)

                                if unreadManager.hasUnreadMessages {
                                    Circle()
                                        .fill(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                                        .frame(width: 12, height: 12)
                                        .overlay(
                                            Text(unreadManager.unreadCount > 9 ? "9+" : "\(unreadManager.unreadCount)")
                                                .font(.system(size: 8, weight: .bold))
                                                .foregroundStyle(Color.white)
                                        )
                                        .offset(x: 6, y: -4)
                                }
                            }

                            Text("Contact Support")
                                .foregroundStyle(textPrimary)
                            Spacer()

                            if unreadManager.hasUnreadMessages {
                                Text("New")
                                    .font(.caption2)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(Color.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
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
                } footer: {
                    Text("Open support chat or review tickets without leaving your account workspace.")
                        .foregroundStyle(textTertiary)
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
            .onChange(of: settings.targetCharacterLength) { _, _ in
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
