//
//  AnalyticsService.swift
//  Prompt
//
//  Analytics and crash reporting service using Firebase
//

import Foundation
import FirebaseCore
import FirebaseAnalytics
import FirebaseCrashlytics

// MARK: - Analytics Event Names

enum AnalyticsEvent: String {
    // Core Events
    case promptEnhanced = "prompt_enhanced"
    case promptCopied = "prompt_copied"
    case promptFavorited = "prompt_favorited"
    case promptDeleted = "prompt_deleted"

    // Authentication Events
    case signInStarted = "sign_in_started"
    case signInCompleted = "sign_in_completed"
    case signInFailed = "sign_in_failed"
    case signOutCompleted = "sign_out_completed"

    // Subscription Events
    case subscriptionViewed = "subscription_viewed"
    case subscriptionPurchased = "subscription_purchased"
    case subscriptionRestored = "subscription_restored"
    case subscriptionCanceled = "subscription_canceled"
    case trialStarted = "trial_started"

    // Feature Events
    case toneSelected = "tone_selected"
    case lengthSelected = "length_selected"
    case historyViewed = "history_viewed"
    case settingsOpened = "settings_opened"

    // Error Events
    case errorOccurred = "error_occurred"
    case apiError = "api_error"
    case networkError = "network_error"
}

// MARK: - Analytics Event Parameters

enum AnalyticsParam: String {
    case toneType = "tone_type"
    case lengthType = "length_type"
    case subscriptionTier = "subscription_tier"
    case productId = "product_id"
    case authProvider = "auth_provider"
    case errorCode = "error_code"
    case errorMessage = "error_message"
    case promptLength = "prompt_length"
    case enhancementDuration = "enhancement_duration_ms"
    case tokenCount = "token_count"
    case success = "success"
    case screen = "screen"
}

// MARK: - Analytics Service

@MainActor
final class AnalyticsService {

    // MARK: - Singleton

    static let shared = AnalyticsService()

    // MARK: - Properties

    private var isConfigured = false

    // MARK: - Initialization

    private init() {}

    // MARK: - Configuration

    /// Configure Firebase services
    /// Call this from your App's init or @main struct
    func configure() {
        guard !isConfigured else { return }

        // Check if GoogleService-Info.plist exists
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            #if DEBUG
            print("[Analytics] GoogleService-Info.plist not found - Firebase disabled")
            #endif
            return
        }

        FirebaseApp.configure()

        // Configure Crashlytics
        #if DEBUG
        // Disable crash collection in debug builds
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(false)
        #else
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(true)
        #endif

        isConfigured = true
        #if DEBUG
        print("[Analytics] Firebase configured successfully")
        #endif
    }

    // MARK: - User Identification

    /// Set the user ID for analytics and crash reports
    func setUserId(_ userId: String?) {
        guard isConfigured else { return }

        Analytics.setUserID(userId)

        if let userId = userId {
            Crashlytics.crashlytics().setUserID(userId)
        }
    }

    /// Set a user property
    func setUserProperty(_ value: String?, forName name: String) {
        guard isConfigured else { return }
        Analytics.setUserProperty(value, forName: name)
    }

    /// Set subscription tier for user segmentation
    func setSubscriptionTier(_ tier: String) {
        setUserProperty(tier, forName: "subscription_tier")
        Crashlytics.crashlytics().setCustomValue(tier, forKey: "subscription_tier")
    }

    // MARK: - Event Tracking

    /// Log an analytics event
    func logEvent(_ event: AnalyticsEvent, parameters: [AnalyticsParam: Any]? = nil) {
        guard isConfigured else { return }

        let params = parameters?.reduce(into: [String: Any]()) { result, pair in
            result[pair.key.rawValue] = pair.value
        }

        Analytics.logEvent(event.rawValue, parameters: params)

        #if DEBUG
        print("[Analytics] Event: \(event.rawValue), params: \(params ?? [:])")
        #endif
    }

    /// Log a custom event with string name
    func logCustomEvent(_ name: String, parameters: [String: Any]? = nil) {
        guard isConfigured else { return }
        Analytics.logEvent(name, parameters: parameters)
    }

    // MARK: - Screen Tracking

    /// Log a screen view
    func logScreenView(_ screenName: String, screenClass: String? = nil) {
        guard isConfigured else { return }

        Analytics.logEvent(AnalyticsEventScreenView, parameters: [
            AnalyticsParameterScreenName: screenName,
            AnalyticsParameterScreenClass: screenClass ?? screenName
        ])
    }

    // MARK: - Crash Reporting

    /// Log a non-fatal error to Crashlytics
    func logError(_ error: Error, userInfo: [String: Any]? = nil) {
        guard isConfigured else { return }

        var errorInfo: [String: Any] = userInfo ?? [:]
        errorInfo["error_description"] = error.localizedDescription

        Crashlytics.crashlytics().record(error: error, userInfo: errorInfo)

        // Also log as analytics event
        logEvent(.errorOccurred, parameters: [
            .errorCode: String(describing: type(of: error)),
            .errorMessage: error.localizedDescription
        ])
    }

    /// Log a non-fatal error with a custom message
    func logError(message: String, code: Int = 0, domain: String = "PromptomizeError") {
        guard isConfigured else { return }

        let error = NSError(domain: domain, code: code, userInfo: [
            NSLocalizedDescriptionKey: message
        ])

        Crashlytics.crashlytics().record(error: error)
    }

    /// Set a custom key-value for crash reports
    func setCrashlyticsKey(_ key: String, value: Any) {
        guard isConfigured else { return }
        Crashlytics.crashlytics().setCustomValue(value, forKey: key)
    }

    /// Log a message to Crashlytics
    func log(_ message: String) {
        guard isConfigured else { return }
        Crashlytics.crashlytics().log(message)
    }

    // MARK: - Convenience Methods

    /// Track prompt enhancement
    func trackPromptEnhanced(
        inputLength: Int,
        outputTokens: Int,
        durationMs: Int,
        tone: String?,
        length: String?
    ) {
        var params: [AnalyticsParam: Any] = [
            .promptLength: inputLength,
            .tokenCount: outputTokens,
            .enhancementDuration: durationMs
        ]

        if let tone = tone {
            params[.toneType] = tone
        }
        if let length = length {
            params[.lengthType] = length
        }

        logEvent(.promptEnhanced, parameters: params)
    }

    /// Track sign in
    func trackSignIn(provider: String, success: Bool, error: Error? = nil) {
        if success {
            logEvent(.signInCompleted, parameters: [
                .authProvider: provider,
                .success: true
            ])
        } else {
            logEvent(.signInFailed, parameters: [
                .authProvider: provider,
                .success: false,
                .errorMessage: error?.localizedDescription ?? "Unknown error"
            ])

            if let error = error {
                logError(error, userInfo: ["auth_provider": provider])
            }
        }
    }

    /// Track subscription purchase
    func trackSubscriptionPurchased(productId: String, tier: String) {
        logEvent(.subscriptionPurchased, parameters: [
            .productId: productId,
            .subscriptionTier: tier
        ])

        setSubscriptionTier(tier)
    }

    /// Track API error
    func trackAPIError(endpoint: String, statusCode: Int, message: String) {
        logEvent(.apiError, parameters: [
            .errorCode: statusCode,
            .errorMessage: message
        ])

        logError(message: "API Error: \(endpoint) - \(statusCode): \(message)")
    }
}

