//
//  AnalyticsView.swift
//  Prompt
//
//  Displays usage analytics with charts
//  AAA WCAG Compliant Colors
//

import SwiftUI
import Charts

struct AnalyticsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var viewModel = AnalyticsViewModel()
    @State private var selectedPeriod = 30

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        ZStack {
            // Consistent liquid glass background
            LiquidGlassBackground()

            ScrollView {
                VStack(spacing: 20) {
                // Period selector
                Picker("Period", selection: $selectedPeriod) {
                    Text("7 Days").tag(7)
                    Text("30 Days").tag(30)
                    Text("90 Days").tag(90)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if viewModel.isLoading {
                    loadingView
                } else if let analytics = viewModel.analytics {
                    // Summary Cards
                    summarySection(analytics)

                    // Model Usage
                    modelUsageSection(analytics)

                    // Streak Info
                    streakSection

                    Spacer(minLength: 40)
                } else if let error = viewModel.error {
                    errorView(error)
                }
            }
                .padding(.top)
            }
        }
        .navigationTitle("Analytics")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .task {
            await viewModel.fetchAnalytics(days: selectedPeriod)
            await viewModel.fetchStreak()
        }
        .onChange(of: selectedPeriod) { _, newValue in
            Task {
                await viewModel.fetchAnalytics(days: newValue)
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .tint(accentColor)
                .scaleEffect(1.2)
            Text("Loading analytics...")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 100)
    }

    // MARK: - Error View

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 80, height: 80)

                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 36, weight: .light))
                    .foregroundStyle(accentColor)
            }

            VStack(spacing: 8) {
                Text("Unable to Load")
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task {
                    await viewModel.fetchAnalytics(days: selectedPeriod)
                }
            } label: {
                Text("Try Again")
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(accentColor)
                    .clipShape(Capsule())
            }
            .buttonStyle(BounceButtonStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Summary Section

    private func summarySection(_ analytics: AnalyticsData) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(
                title: "Total Prompts",
                value: "\(analytics.summary.totalPrompts)",
                icon: "doc.text.fill",
                color: .blue
            )

            StatCard(
                title: "Starred",
                value: "\(analytics.summary.favoriteCount)",
                icon: "star.fill",
                color: .yellow
            )

            StatCard(
                title: "Total Tokens",
                value: formatNumber(analytics.summary.totalTokens),
                icon: "number",
                color: .green
            )

            StatCard(
                title: "Avg/Day",
                value: String(format: "%.1f", analytics.summary.avgPromptsPerDay),
                icon: "calendar",
                color: .purple
            )
        }
        .padding(.horizontal)
    }

    // MARK: - Model Usage Section

    private func modelUsageSection(_ analytics: AnalyticsData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Model Usage")
                .font(.system(.headline, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            if analytics.charts.modelUsage.isEmpty {
                Text("No data yet")
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else {
                Chart(analytics.charts.modelUsage, id: \.model) { item in
                    SectorMark(
                        angle: .value("Count", item.count),
                        innerRadius: .ratio(0.5),
                        angularInset: 2
                    )
                    .foregroundStyle(by: .value("Model", formatModelName(item.model)))
                    .cornerRadius(4)
                }
                .frame(height: 200)
                .chartLegend(position: .bottom, spacing: 20)
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 16)
        .padding(.horizontal)
    }

    // MARK: - Streak Section

    private var streakSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Activity Streak")
                .font(.system(.headline, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            HStack(spacing: 20) {
                StreakStat(
                    title: "Current Streak",
                    value: "\(viewModel.streak?.currentStreak ?? 0)",
                    unit: "days",
                    icon: "flame.fill",
                    color: .orange
                )

                StreakStat(
                    title: "Longest Streak",
                    value: "\(viewModel.streak?.longestStreak ?? 0)",
                    unit: "days",
                    icon: "trophy.fill",
                    color: .yellow
                )

                StreakStat(
                    title: "Active Days",
                    value: "\(viewModel.streak?.totalActiveDays ?? 0)",
                    unit: "total",
                    icon: "calendar.badge.checkmark",
                    color: accentColor
                )
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 16)
        .padding(.horizontal)
    }

    // MARK: - Helpers

    private func formatNumber(_ number: Int) -> String {
        if number >= 1_000_000 {
            return String(format: "%.1fM", Double(number) / 1_000_000)
        } else if number >= 1_000 {
            return String(format: "%.1fK", Double(number) / 1_000)
        }
        return "\(number)"
    }

    private func formatModelName(_ model: String) -> String {
        if model.contains("reasoner") {
            return "MAX"
        } else if model.contains("chat") {
            return "Standard"
        }
        return model
    }
}

// MARK: - Stat Card

struct StatCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let value: String
    let icon: String
    let color: Color

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(color)
                Spacer()
            }

            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(textPrimary)

            Text(title)
                .font(.system(.caption, design: .rounded, weight: .medium))
                .foregroundStyle(textSecondary)
        }
        .padding(16)
        .liquidGlass(cornerRadius: 12)
    }
}

// MARK: - Streak Stat

struct StreakStat: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let value: String
    let unit: String
    let icon: String
    let color: Color

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(color)

            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(textPrimary)

            Text(unit)
                .font(.caption2)
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - View Model

@Observable
@MainActor
final class AnalyticsViewModel {
    var analytics: AnalyticsData?
    var streak: StreakData?
    var isLoading = false
    var error: String?

    func fetchAnalytics(days: Int) async {
        guard await APIClient.shared.isAuthenticated else {
            error = "Please sign in to view analytics"
            return
        }

        isLoading = true
        error = nil

        do {
            analytics = try await APIClient.shared.request("/analytics?days=\(days)")
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func fetchStreak() async {
        guard await APIClient.shared.isAuthenticated else { return }

        do {
            streak = try await APIClient.shared.request("/analytics/streak")
        } catch {
            #if DEBUG
            print("Failed to fetch streak: \(error)")
            #endif
        }
    }
}

// MARK: - Data Models

struct AnalyticsData: Decodable {
    let summary: Summary
    let charts: Charts
    let period: Period

    struct Summary: Decodable {
        let totalPrompts: Int
        let favoriteCount: Int
        let totalTokens: Int
        let avgPromptsPerDay: Double
        let avgTokensPerPrompt: Int
        let collectionCount: Int
    }

    struct Charts: Decodable {
        let promptsByDay: [DayCount]
        let modelUsage: [ModelCount]
        let topTags: [TagCount]
    }

    struct DayCount: Decodable {
        let date: String
        let count: Int
    }

    struct ModelCount: Decodable {
        let model: String
        let count: Int
    }

    struct TagCount: Decodable {
        let tag: String
        let count: Int
    }

    struct Period: Decodable {
        let days: Int
        let startDate: String
        let endDate: String
    }
}

struct StreakData: Decodable {
    let currentStreak: Int
    let longestStreak: Int
    let totalActiveDays: Int
}

#Preview {
    NavigationStack {
        AnalyticsView()
    }
}
