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
            access: .active,
            userName: nil,
            userEmail: nil
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

        let access = WidgetAccessState.load(from: defaults)
        let userName = defaults?.string(forKey: "userName")
        let userEmail = defaults?.string(forKey: "userEmail")

        // Load recent prompts
        var recentPrompts: [RecentPromptData] = []
        if let data = defaults?.data(forKey: "recentPrompts"),
           let decoded = try? JSONDecoder().decode([RecentPromptData].self, from: data) {
            recentPrompts = decoded
        }

        return QuickEnhanceEntry(
            date: Date(),
            recentPrompts: recentPrompts,
            access: access,
            userName: userName,
            userEmail: userEmail
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
    let access: WidgetAccessState
    let userName: String?
    let userEmail: String?
}

// MARK: - Brand Colors

private extension Color {
    static let brandPurple = Color(red: 91/255, green: 76/255, blue: 219/255)
    static let brandCyan = Color(red: 0/255, green: 230/255, blue: 230/255)
    static let brandPurpleDark = Color(red: 61/255, green: 50/255, blue: 176/255)
}

// MARK: - Widget Views

struct QuickEnhanceWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var colorScheme
    var entry: QuickEnhanceEntry

    private var accentColor: Color {
        colorScheme == .dark ? .brandCyan : .brandPurple
    }

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
        .containerBackground(for: .widget) {
            colorScheme == .dark
                ? Color.black
                : Color(red: 250/255, green: 249/255, blue: 255/255)
        }
    }
}

// MARK: - Medium Widget

struct MediumView: View {
    @Environment(\.colorScheme) var colorScheme
    let entry: QuickEnhanceEntry

    private var accentColor: Color {
        colorScheme == .dark ? .brandCyan : .brandPurple
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(accentColor)
                    Text("Promptomize")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                }
                Spacer()
                AccessBadge(access: entry.access)
            }

            // Recent prompt or empty state
            if let recent = entry.recentPrompts.first {
                RecentPromptRow(prompt: recent, compact: true)
            } else {
                EmptyStateView(compact: true)
            }

            // Quick action button
            Link(destination: entry.access.destination) {
                HStack(spacing: 6) {
                    Image(systemName: entry.access == .active ? "plus.circle.fill" : "lock.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text(entry.access.callToAction)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(accentColor)
                )
                .foregroundStyle(colorScheme == .dark ? .black : .white)
            }
        }
        .padding()
    }
}

// MARK: - Large Widget

struct LargeView: View {
    @Environment(\.colorScheme) var colorScheme
    let entry: QuickEnhanceEntry

    private var accentColor: Color {
        colorScheme == .dark ? .brandCyan : .brandPurple
    }

    private var textSecondary: Color {
        colorScheme == .dark
            ? Color(red: 142/255, green: 142/255, blue: 147/255)
            : Color(red: 61/255, green: 52/255, blue: 117/255)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(accentColor)
                    Text("Promptomize")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                }
                Spacer()
                AccessBadge(access: entry.access)
            }

            // User info row
            if let email = entry.userEmail {
                HStack(spacing: 8) {
                    // Avatar circle
                    let initial = String((entry.userName ?? email).prefix(1)).uppercased()
                    Circle()
                        .fill(Color(red: 0.35, green: 0.55, blue: 0.82))
                        .frame(width: 24, height: 24)
                        .overlay {
                            Text(initial)
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                        }
                    Text(email)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(textSecondary)
                        .lineLimit(1)
                    Spacer()
                }
            }

            Rectangle()
                .fill(colorScheme == .dark
                    ? Color.white.opacity(0.1)
                    : Color.brandPurple.opacity(0.1))
                .frame(height: 1)

            // Recent prompts
            if entry.recentPrompts.isEmpty {
                EmptyStateView(compact: false)
                    .frame(maxHeight: .infinity)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Recent")
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)

                    ForEach(entry.recentPrompts.prefix(3)) { prompt in
                        RecentPromptRow(prompt: prompt, compact: false)
                    }
                }
            }

            Spacer()

            // Quick action button
            Link(destination: entry.access.destination) {
                HStack(spacing: 6) {
                    Image(systemName: entry.access == .active ? "plus.circle.fill" : "lock.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text(entry.access.callToAction)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(accentColor)
                )
                .foregroundStyle(colorScheme == .dark ? .black : .white)
            }
        }
        .padding()
    }
}

// MARK: - Supporting Views

struct AccessBadge: View {
    let access: WidgetAccessState

    var body: some View {
        Text(label)
            .font(.system(.caption2, design: .rounded, weight: .bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(color.opacity(0.15))
            )
            .foregroundStyle(color)
    }

    private var label: String {
        switch access {
        case .active: return "Premium"
        case .subscriptionRequired: return "Locked"
        case .signedOut: return "Signed out"
        }
    }

    private var color: Color {
        access == .active ? .orange : .secondary
    }
}

struct RecentPromptRow: View {
    @Environment(\.colorScheme) var colorScheme
    let prompt: RecentPromptData
    let compact: Bool

    private var accentColor: Color {
        colorScheme == .dark ? .brandCyan : .brandPurple
    }

    private var textSecondary: Color {
        colorScheme == .dark
            ? Color(red: 142/255, green: 142/255, blue: 147/255)
            : Color(red: 61/255, green: 52/255, blue: 117/255)
    }

    var body: some View {
        Link(destination: URL(string: "promptomize://prompt/\(prompt.id)")!) {
            VStack(alignment: .leading, spacing: 4) {
                Text(prompt.original)
                    .font(.system(.subheadline, design: .rounded))
                    .lineLimit(compact ? 1 : 2)
                    .foregroundStyle(.primary)

                HStack(spacing: 4) {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(accentColor)
                    Text(prompt.enhanced)
                        .font(.system(.caption, design: .rounded))
                        .lineLimit(1)
                        .foregroundStyle(textSecondary)
                }

                if !compact {
                    Text(prompt.date, style: .relative)
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.white)
            )
        }
    }
}

struct EmptyStateView: View {
    @Environment(\.colorScheme) var colorScheme
    let compact: Bool

    private var accentColor: Color {
        colorScheme == .dark ? .brandCyan : .brandPurple
    }

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "text.bubble")
                .font(.system(compact ? .title3 : .title, design: .rounded, weight: .light))
                .foregroundStyle(accentColor.opacity(0.6))

            Text("No recent prompts")
                .font(.system(compact ? .caption : .subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(.secondary)

            if !compact {
                Text("Tap below to enhance your first prompt")
                    .font(.system(.caption, design: .rounded))
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
                .widgetURL(entry.access.destination)
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
        access: .subscriptionRequired,
        userName: nil,
        userEmail: nil
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
        access: .active,
        userName: "Will",
        userEmail: "will@example.com"
    )
}
