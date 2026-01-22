//
//  QuotaWidget.swift
//  PromptWidgetExtension
//
//  Lock screen and home screen widget showing daily prompt quota
//

import WidgetKit
import SwiftUI

// MARK: - Timeline Provider

struct QuotaProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuotaEntry {
        QuotaEntry(date: Date(), used: 5, limit: 10, tier: "FREE")
    }

    func getSnapshot(in context: Context, completion: @escaping (QuotaEntry) -> Void) {
        let entry = loadEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuotaEntry>) -> Void) {
        let entry = loadEntry()

        // Refresh every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> QuotaEntry {
        let defaults = UserDefaults(suiteName: "group.com.res.promptomizer")
        let used = defaults?.integer(forKey: "dailyPromptsUsed") ?? 0
        let limit = defaults?.integer(forKey: "dailyPromptsLimit") ?? 10
        let tier = defaults?.string(forKey: "subscriptionTier") ?? "FREE"

        return QuotaEntry(
            date: Date(),
            used: used,
            limit: limit == 0 ? 10 : limit,
            tier: tier
        )
    }
}

// MARK: - Entry

struct QuotaEntry: TimelineEntry {
    let date: Date
    let used: Int
    let limit: Int
    let tier: String

    var remaining: Int {
        if limit == -1 { return Int.max }
        return max(0, limit - used)
    }

    var isUnlimited: Bool {
        limit == -1
    }

    var progress: Double {
        if isUnlimited { return 0 }
        guard limit > 0 else { return 1.0 }
        return Double(used) / Double(limit)
    }
}

// MARK: - Widget Views

struct QuotaWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: QuotaEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                CircularView(entry: entry)
            case .accessoryRectangular:
                RectangularView(entry: entry)
            case .accessoryInline:
                InlineView(entry: entry)
            case .systemSmall:
                SmallView(entry: entry)
            default:
                SmallView(entry: entry)
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Lock Screen Circular

struct CircularView: View {
    let entry: QuotaEntry

    var body: some View {
        if entry.isUnlimited {
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "infinity")
                        .font(.title2)
                    Text("PRO")
                        .font(.caption2)
                        .fontWeight(.medium)
                }
            }
        } else {
            Gauge(value: 1 - entry.progress) {
                Image(systemName: "sparkles")
            } currentValueLabel: {
                Text("\(entry.remaining)")
                    .font(.system(.title3, design: .rounded))
                    .fontWeight(.bold)
            }
            .gaugeStyle(.accessoryCircularCapacity)
        }
    }
}

// MARK: - Lock Screen Rectangular

struct RectangularView: View {
    let entry: QuotaEntry

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles")
                .font(.title2)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 2) {
                if entry.isUnlimited {
                    Text("Unlimited")
                        .font(.headline)
                    Text("Premium Active")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("\(entry.remaining) left")
                        .font(.headline)
                    Text("\(entry.used)/\(entry.limit) prompts today")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
        }
    }
}

// MARK: - Lock Screen Inline

struct InlineView: View {
    let entry: QuotaEntry

    var body: some View {
        if entry.isUnlimited {
            Label("Unlimited Prompts", systemImage: "infinity")
        } else {
            Label("\(entry.remaining) prompts left", systemImage: "sparkles")
        }
    }
}

// MARK: - Home Screen Small

struct SmallView: View {
    let entry: QuotaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundStyle(.blue)
                Spacer()
                Text(entry.tier)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(tierColor.opacity(0.2))
                    .foregroundStyle(tierColor)
                    .clipShape(Capsule())
            }

            Spacer()

            if entry.isUnlimited {
                Text("Unlimited")
                    .font(.system(.title, design: .rounded))
                    .fontWeight(.bold)
                Text("prompts available")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("\(entry.remaining)")
                    .font(.system(.largeTitle, design: .rounded))
                    .fontWeight(.bold)
                Text("prompts left today")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(.gray.opacity(0.2))
                            .frame(height: 4)

                        RoundedRectangle(cornerRadius: 2)
                            .fill(progressColor)
                            .frame(width: geo.size.width * (1 - entry.progress), height: 4)
                    }
                }
                .frame(height: 4)
            }
        }
        .padding()
    }

    var tierColor: Color {
        switch entry.tier {
        case "PREMIUM": return .purple
        case "PRO": return .blue
        default: return .gray
        }
    }

    var progressColor: Color {
        if entry.progress > 0.9 {
            return .red
        } else if entry.progress > 0.7 {
            return .orange
        } else {
            return .green
        }
    }
}

// MARK: - Widget Configuration

struct QuotaWidget: Widget {
    let kind: String = "QuotaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuotaProvider()) { entry in
            QuotaWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Prompt Quota")
        .description("Track your daily prompt usage")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .systemSmall
        ])
    }
}

// MARK: - Preview

#Preview(as: .accessoryCircular) {
    QuotaWidget()
} timeline: {
    QuotaEntry(date: .now, used: 3, limit: 10, tier: "FREE")
    QuotaEntry(date: .now, used: 8, limit: 10, tier: "FREE")
}

#Preview(as: .systemSmall) {
    QuotaWidget()
} timeline: {
    QuotaEntry(date: .now, used: 5, limit: 10, tier: "FREE")
    QuotaEntry(date: .now, used: 0, limit: -1, tier: "PREMIUM")
}
