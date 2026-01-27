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
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
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

                    // Prompts by Day Chart
                    promptsChartSection(analytics)

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
        .background(bgPrimary.ignoresSafeArea())
        .navigationTitle("Analytics")
        .navigationBarTitleDisplayMode(.large)
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
        VStack(spacing: 16) {
            ProgressView()
                .tint(textPrimary)
            Text("Loading analytics...")
                .font(.subheadline)
                .foregroundStyle(textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 100)
    }

    // MARK: - Error View

    private func errorView(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Unable to Load", systemImage: "exclamationmark.triangle")
                .foregroundStyle(textPrimary)
        } description: {
            Text(message)
                .foregroundStyle(textSecondary)
        } actions: {
            Button("Try Again") {
                Task {
                    await viewModel.fetchAnalytics(days: selectedPeriod)
                }
            }
            .buttonStyle(.borderedProminent)
        }
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
                title: "Favorites",
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

    // MARK: - Prompts Chart Section

    private func promptsChartSection(_ analytics: AnalyticsData) -> some View {
        // Convert string dates to Date objects for proper chart spacing
        let chartData = analytics.charts.promptsByDay.compactMap { item -> (date: Date, count: Int)? in
            guard let date = parseDate(item.date) else { return nil }
            return (date: date, count: item.count)
        }

        return VStack(alignment: .leading, spacing: 12) {
            Text("Prompts Over Time")
                .font(.headline)
                .foregroundStyle(textPrimary)

            if chartData.isEmpty {
                Text("No data for this period")
                    .font(.subheadline)
                    .foregroundStyle(textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 60)
            } else {
                Chart(chartData, id: \.date) { item in
                    BarMark(
                        x: .value("Date", item.date, unit: .day),
                        y: .value("Count", item.count)
                    )
                    .foregroundStyle(buttonPrimary.gradient)
                    .cornerRadius(4)
                }
                .frame(height: 200)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: xAxisLabelCount)) { value in
                        AxisGridLine()
                        AxisValueLabel(centered: true) {
                            if let date = value.as(Date.self) {
                                Text(formatAxisDate(date))
                                    .font(.caption2)
                                    .foregroundStyle(textTertiary)
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisValueLabel {
                            if let intValue = value.as(Int.self) {
                                Text("\(intValue)")
                                    .font(.caption2)
                                    .foregroundStyle(textTertiary)
                            }
                        }
                        AxisGridLine()
                    }
                }
            }
        }
        .padding()
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    /// Determine the number of X-axis labels based on selected period
    private var xAxisLabelCount: Int {
        switch selectedPeriod {
        case 7:
            return 7
        case 30:
            return 6
        case 90:
            return 6
        default:
            return 7
        }
    }

    // MARK: - Model Usage Section

    private func modelUsageSection(_ analytics: AnalyticsData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Model Usage")
                .font(.headline)
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
        .padding()
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    // MARK: - Streak Section

    private var streakSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Activity Streak")
                .font(.headline)
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
                    color: .green
                )
            }
        }
        .padding()
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
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

    /// Parse ISO8601 date string to Date object
    private func parseDate(_ dateStr: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter.date(from: dateStr)
    }

    /// Format axis date based on selected period
    private func formatAxisDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        switch selectedPeriod {
        case 7:
            // Show day abbreviation for 7-day view (Mon, Tue, etc.)
            formatter.dateFormat = "E"
        case 30:
            // Show month/day for 30-day view
            formatter.dateFormat = "M/d"
        case 90:
            // Show abbreviated month and day for 90-day view
            formatter.dateFormat = "MMM d"
        default:
            formatter.dateFormat = "M/d"
        }
        return formatter.string(from: date)
    }

    private func formatModelName(_ model: String) -> String {
        if model.contains("reasoner") {
            return "Deep Think"
        } else if model.contains("chat") {
            return "Fast Mode"
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
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(color)
                Spacer()
            }

            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(textPrimary)

            Text(title)
                .font(.caption)
                .foregroundStyle(textSecondary)
        }
        .padding()
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
        let templateCount: Int
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
