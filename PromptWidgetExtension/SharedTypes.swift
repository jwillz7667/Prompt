//
//  SharedTypes.swift
//  PromptWidgetExtension
//
//  Shared types between main app and widget extension
//  Note: These types are duplicated from the main app for widget extension access
//

import ActivityKit
import Foundation

// MARK: - Enhancement Activity Attributes

struct EnhancementActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var stage: EnhancementStage
        var progress: Double
        var statusMessage: String
        var enhancedPreview: String?
    }

    var originalPrompt: String
    var promptPreview: String
    var startTime: Date
}

// MARK: - Enhancement Stages

enum EnhancementStage: String, Codable, Hashable {
    case analyzing = "analyzing"
    case enhancing = "enhancing"
    case optimizing = "optimizing"
    case completed = "completed"
    case failed = "failed"

    var displayName: String {
        switch self {
        case .analyzing: return "Analyzing"
        case .enhancing: return "Enhancing"
        case .optimizing: return "Optimizing"
        case .completed: return "Complete"
        case .failed: return "Failed"
        }
    }

    var icon: String {
        switch self {
        case .analyzing: return "magnifyingglass"
        case .enhancing: return "sparkles"
        case .optimizing: return "slider.horizontal.3"
        case .completed: return "checkmark.circle.fill"
        case .failed: return "xmark.circle.fill"
        }
    }

    var progress: Double {
        switch self {
        case .analyzing: return 0.25
        case .enhancing: return 0.5
        case .optimizing: return 0.75
        case .completed: return 1.0
        case .failed: return 0.0
        }
    }

    var isInProgress: Bool {
        switch self {
        case .analyzing, .enhancing, .optimizing:
            return true
        case .completed, .failed:
            return false
        }
    }
}

// MARK: - Access State

/// What the widget may offer, from the entitlement the app last verified.
/// The app writes `subscriptionTier` = "PREMIUM" only while entitled.
enum WidgetAccessState: Equatable {
    case signedOut
    case subscriptionRequired
    case active

    static func load(from defaults: UserDefaults?) -> WidgetAccessState {
        guard defaults?.bool(forKey: "isAuthenticated") == true else { return .signedOut }
        return defaults?.string(forKey: "subscriptionTier") == "PREMIUM" ? .active : .subscriptionRequired
    }

    var callToAction: String {
        switch self {
        case .signedOut: return "Sign in — open Promptomize"
        case .subscriptionRequired: return "Subscription required — open Promptomize"
        case .active: return "Enhance New Prompt"
        }
    }

    var destination: URL {
        switch self {
        case .signedOut: return URL(string: "promptomize://enhance")!
        case .subscriptionRequired: return URL(string: "promptomize://paywall")!
        case .active: return URL(string: "promptomize://enhance")!
        }
    }
}
