//
//  QuickEnhanceWidget.swift
//  PromptWidgetExtension
//
//  Home screen widget with recent prompts and quick action button
//

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Timeline Provider

struct QuickEnhanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickEnhanceEntry {
        QuickEnhanceEntry(
            date: Date(),
            recentPrompts: [
                .init(id: "1", original: "Sample prompt...", enhanced: "Enhanced version...", date: Date())
            ],
            quotaRemaining: 7,
            quotaLimit: 10,
            tier: "FREE"
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (QuickEnhanceEntry) -> Void) {
        let entry = loadEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickEnhanceEntry>) -> Void) {
        let entry = loadEntry()

        // Refresh every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> QuickEnhanceEntry {
        let defaults = UserDefaults(suiteName: "group.com.res.promptomizer")

        // Load quota info
        let used = defaults?.integer(forKey: "dailyPromptsUsed") ?? 0
        let limit = defaults?.integer(forKey: "dailyPromptsLimit") ?? 10
        let tier = defaults?.string(forKey: "subscriptionTier") ?? "FREE"

        // Load recent prompts
        var recentPrompts: [RecentPromptData] = []
        if let data = defaults?.data(forKey: "recentPrompts"),
           let decoded = try? JSONDecoder().decode([RecentPromptData].self, from: data) {
            recentPrompts = decoded
        }

        return QuickEnhanceEntry(
            date: Date(),
            recentPrompts: recentPrompts,
            quotaRemaining: limit == -1 ? Int.max : max(0, limit - used),
            quotaLimit: limit,
            tier: tier
        )
    }
}

// MARK: - Recent Prompt Data

struct RecentPromptData: Codable, Identifiable {
    let id: String
    let original: String
    let enhanced: String
    let date: Date
}

// MARK: - Entry

struct QuickEnhanceEntry: TimelineEntry {
    let date: Date
    let recentPrompts: [RecentPromptData]
    let quotaRemaining: Int
    let quotaLimit: Int
    let tier: String

    var isUnlimited: Bool {
        quotaLimit == -1
    }
}

// MARK: - Widget Views

struct QuickEnhanceWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: QuickEnhanceEntry

    var body: some View {
        Group {
            switch family {
            case .systemMedium:
                MediumView(entry: entry)
            case .systemLarge:
                LargeView(entry: entry)
            default:
                MediumView(entry: entry)
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Medium Widget

struct MediumView: View {
    let entry: QuickEnhanceEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(.blue)
                Text("Promptomize")
                    .font(.headline)
                Spacer()
                QuotaBadge(remaining: entry.quotaRemaining, limit: entry.quotaLimit, tier: entry.tier)
            }

            // Recent prompt or empty state
            if let recent = entry.recentPrompts.first {
                RecentPromptRow(prompt: recent, compact: true)
            } else {
                EmptyStateView(compact: true)
            }

            // Quick action button
            Link(destination: URL(string: "promptomize://enhance")!) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Enhance New Prompt")
                        .fontWeight(.medium)
                }
                .font(.subheadline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(.blue)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding()
    }
}

// MARK: - Large Widget

struct LargeView: View {
    let entry: QuickEnhanceEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(.blue)
                Text("Promptomize")
                    .font(.headline)
                Spacer()
                QuotaBadge(remaining: entry.quotaRemaining, limit: entry.quotaLimit, tier: entry.tier)
            }

            Divider()

            // Recent prompts
            if entry.recentPrompts.isEmpty {
                EmptyStateView(compact: false)
                    .frame(maxHeight: .infinity)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recent")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ForEach(entry.recentPrompts.prefix(3)) { prompt in
                        RecentPromptRow(prompt: prompt, compact: false)
                    }
                }
            }

            Spacer()

            // Quick action button
            Link(destination: URL(string: "promptomize://enhance")!) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Enhance New Prompt")
                        .fontWeight(.medium)
                }
                .font(.subheadline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(.blue)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding()
    }
}

// MARK: - Supporting Views

struct QuotaBadge: View {
    let remaining: Int
    let limit: Int
    let tier: String

    var body: some View {
        HStack(spacing: 4) {
            if limit == -1 {
                Image(systemName: "infinity")
                    .font(.caption2)
            } else {
                Text("\(remaining)")
                    .font(.caption)
                    .fontWeight(.bold)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(badgeColor.opacity(0.15))
        .foregroundStyle(badgeColor)
        .clipShape(Capsule())
    }

    var badgeColor: Color {
        if limit == -1 { return .purple }
        if remaining == 0 { return .red }
        if remaining <= 3 { return .orange }
        return .green
    }
}

struct RecentPromptRow: View {
    let prompt: RecentPromptData
    let compact: Bool

    var body: some View {
        Link(destination: URL(string: "promptomize://prompt/\(prompt.id)")!) {
            VStack(alignment: .leading, spacing: 4) {
                Text(prompt.original)
                    .font(.subheadline)
                    .lineLimit(compact ? 1 : 2)
                    .foregroundStyle(.primary)

                HStack {
                    Image(systemName: "arrow.right")
                        .font(.caption2)
                    Text(prompt.enhanced)
                        .font(.caption)
                        .lineLimit(1)
                }
                .foregroundStyle(.secondary)

                if !compact {
                    Text(prompt.date, style: .relative)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}

struct EmptyStateView: View {
    let compact: Bool

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "text.bubble")
                .font(compact ? .title3 : .title)
                .foregroundStyle(.secondary)

            Text("No recent prompts")
                .font(compact ? .caption : .subheadline)
                .foregroundStyle(.secondary)

            if !compact {
                Text("Tap below to enhance your first prompt")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}

// MARK: - Widget Configuration

struct QuickEnhanceWidget: Widget {
    let kind: String = "QuickEnhanceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickEnhanceProvider()) { entry in
            QuickEnhanceWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Quick Enhance")
        .description("Recent prompts and quick access to enhancement")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: - Preview

#Preview(as: .systemMedium) {
    QuickEnhanceWidget()
} timeline: {
    QuickEnhanceEntry(
        date: .now,
        recentPrompts: [
            RecentPromptData(id: "1", original: "Write a blog post about AI", enhanced: "You are an expert tech writer...", date: Date())
        ],
        quotaRemaining: 7,
        quotaLimit: 10,
        tier: "FREE"
    )
}

#Preview(as: .systemLarge) {
    QuickEnhanceWidget()
} timeline: {
    QuickEnhanceEntry(
        date: .now,
        recentPrompts: [
            RecentPromptData(id: "1", original: "Write a blog post about AI", enhanced: "You are an expert tech writer...", date: Date()),
            RecentPromptData(id: "2", original: "Help me debug this code", enhanced: "You are a senior software engineer...", date: Date().addingTimeInterval(-3600)),
            RecentPromptData(id: "3", original: "Create a marketing email", enhanced: "You are a marketing specialist...", date: Date().addingTimeInterval(-7200))
        ],
        quotaRemaining: 5,
        quotaLimit: 10,
        tier: "PRO"
    )
}
