//
//  QuotaWidget.swift
//  PromptWidgetExtension
//
//  Lock screen and home screen widget showing Promptomize Premium status.
//  The type and kind keep their original "Quota" names so widgets users
//  already placed keep working after the update.
//

import WidgetKit
import SwiftUI

// MARK: - Brand Colors (Widget)

private extension Color {
    static let brandPurple = Color(red: 91/255, green: 76/255, blue: 219/255)
    static let brandCyan = Color(red: 0/255, green: 230/255, blue: 230/255)
}

// MARK: - Timeline Provider

struct QuotaProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuotaEntry {
        QuotaEntry(date: Date(), access: .active)
    }

    func getSnapshot(in context: Context, completion: @escaping (QuotaEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuotaEntry>) -> Void) {
        // The app reloads timelines whenever entitlement changes; the hourly
        // refresh only catches changes made while the app was not running.
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        completion(Timeline(entries: [loadEntry()], policy: .after(nextUpdate)))
    }

    private func loadEntry() -> QuotaEntry {
        QuotaEntry(
            date: Date(),
            access: WidgetAccessState.load(from: UserDefaults(suiteName: "group.com.res.promptomizer"))
        )
    }
}

// MARK: - Entry

struct QuotaEntry: TimelineEntry {
    let date: Date
    let access: WidgetAccessState

    var headline: String {
        switch access {
        case .active: return "Premium active"
        case .subscriptionRequired: return "Subscription required"
        case .signedOut: return "Sign in required"
        }
    }

    var detail: String {
        switch access {
        case .active: return "Tap to optimize a prompt"
        case .subscriptionRequired, .signedOut: return "Open Promptomize"
        }
    }

    var symbol: String {
        access == .active ? "sparkles" : "lock.fill"
    }
}

// MARK: - Widget Views

struct QuotaWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var colorScheme
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
            default:
                SmallView(entry: entry)
            }
        }
        .containerBackground(for: .widget) {
            if family == .systemSmall {
                AnyView(
                    colorScheme == .dark
                        ? Color.black
                        : Color(red: 250/255, green: 249/255, blue: 255/255)
                )
            } else {
                AnyView(Color.clear.background(.fill.tertiary))
            }
        }
    }
}

// MARK: - Lock Screen Circular

struct CircularView: View {
    let entry: QuotaEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: entry.symbol)
                .font(.system(.title2, design: .rounded, weight: .semibold))
        }
        .accessibilityLabel(entry.headline)
    }
}

// MARK: - Lock Screen Rectangular

struct RectangularView: View {
    let entry: QuotaEntry

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: entry.symbol)
                .font(.system(.title2, design: .rounded))
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.headline)
                    .font(.system(.headline, design: .rounded))
                Text(entry.detail)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
    }
}

// MARK: - Lock Screen Inline

struct InlineView: View {
    let entry: QuotaEntry

    var body: some View {
        Label(entry.headline, systemImage: entry.symbol)
    }
}

// MARK: - Home Screen Small

struct SmallView: View {
    @Environment(\.colorScheme) var colorScheme
    let entry: QuotaEntry

    private var accentColor: Color {
        colorScheme == .dark ? .brandCyan : .brandPurple
    }

    var body: some View {
        Link(destination: entry.access.destination) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: entry.symbol)
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .foregroundStyle(entry.access == .active ? accentColor : .secondary)

                Spacer()

                Text(entry.headline)
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text(entry.access == .active ? entry.detail : entry.access.callToAction)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }
}

// MARK: - Widget Configuration

struct QuotaWidget: Widget {
    let kind: String = "QuotaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuotaProvider()) { entry in
            QuotaWidgetEntryView(entry: entry)
                .widgetURL(entry.access.destination)
        }
        .configurationDisplayName("Premium Status")
        .description("See whether Promptomize Premium is active")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .systemSmall
        ])
    }
}

// MARK: - Preview

#Preview(as: .accessoryRectangular) {
    QuotaWidget()
} timeline: {
    QuotaEntry(date: .now, access: .active)
    QuotaEntry(date: .now, access: .subscriptionRequired)
}

#Preview(as: .systemSmall) {
    QuotaWidget()
} timeline: {
    QuotaEntry(date: .now, access: .active)
    QuotaEntry(date: .now, access: .subscriptionRequired)
}
