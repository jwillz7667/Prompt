//
//  ControlCenterAction.swift
//  Prompt
//
//  Control Center quick action for iOS 18+
//

import AppIntents
import SwiftUI

// MARK: - Control Center Toggle (iOS 18+)
// Note: ControlWidget APIs require iOS 18.0+

#if canImport(WidgetKit)
import WidgetKit

@available(iOS 18.0, *)
struct QuickEnhanceControlWidget: ControlWidget {
    static let kind: String = "com.res.promptomizer.quickenhance"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: QuickEnhanceControlIntent()) {
                Label("Enhance", systemImage: "sparkles")
            }
        }
        .displayName("Promptomize")
        .description("Open Promptomize to enhance a prompt")
    }
}

@available(iOS 18.0, *)
struct QuickEnhanceControlIntent: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Quick Enhance"
    static let description = IntentDescription("Opens Promptomize to enhance a new prompt")

    static let isDiscoverable = true
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        return .result()
    }
}

// MARK: - Control Center Status Widget (iOS 18+)

@available(iOS 18.0, *)
struct QuotaStatusControlWidget: ControlWidget {
    static let kind: String = "com.res.promptomizer.quotastatus"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenAppControlIntent()) {
                Label {
                    Text("Prompts")
                } icon: {
                    Image(systemName: "sparkles")
                }
            }
        }
        .displayName("Prompt Quota")
        .description("Opens Promptomize")
    }
}

@available(iOS 18.0, *)
struct OpenAppControlIntent: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Open App"
    static let description = IntentDescription("Opens Promptomize")

    static let isDiscoverable = false
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        return .result()
    }
}

#endif
