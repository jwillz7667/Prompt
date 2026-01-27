import Foundation

// MARK: - Subscription Tier

enum SubscriptionTier: String, Codable, CaseIterable {
    case free = "FREE"
    case pro = "PRO"
    case premium = "PREMIUM"

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .pro: return "Pro"
        case .premium: return "Premium"
        }
    }

    var promptQuality: PromptTier {
        switch self {
        case .free: return .basic
        case .pro: return .standard
        case .premium: return .advanced
        }
    }
}

// MARK: - Subscription Status

enum SubscriptionStatus: String, Codable {
    case active = "ACTIVE"
    case expired = "EXPIRED"
    case canceled = "CANCELED"
    case gracePeriod = "GRACE_PERIOD"

    var isActive: Bool {
        self == .active || self == .gracePeriod
    }
}

// MARK: - Prompt Tier (for meta-prompt quality)

enum PromptTier: String, Codable {
    case basic
    case standard
    case advanced

    var displayName: String {
        switch self {
        case .basic: return "Basic"
        case .standard: return "Standard"
        case .advanced: return "Advanced"
        }
    }

    var description: String {
        switch self {
        case .basic: return "Clear structure and basic prompting"
        case .standard: return "RISEN framework + Chain-of-Thought"
        case .advanced: return "All techniques including Tree-of-Thought"
        }
    }
}

// MARK: - Tier Features

struct TierFeatures: Codable {
    let promptQuality: String
    let canExport: Bool
    let maxTokensPerPrompt: Int

    var promptTier: PromptTier {
        PromptTier(rawValue: promptQuality) ?? .basic
    }
}

// MARK: - App Subscription Info (renamed to avoid conflict with StoreKit.SubscriptionInfo)

struct AppSubscriptionInfo: Codable, Sendable {
    let tier: SubscriptionTier
    let status: SubscriptionStatus
    let expiresAt: Date?
    let isTrialing: Bool
    let trialEndsAt: Date?
    let features: TierFeatures

    var isActive: Bool {
        status.isActive
    }

    var daysUntilExpiry: Int? {
        guard let expiresAt = expiresAt else { return nil }
        let calendar = Calendar.current
        let components = calendar.dateComponents([.day], from: Date(), to: expiresAt)
        return components.day
    }

    var trialDaysRemaining: Int? {
        guard isTrialing, let trialEndsAt = trialEndsAt else { return nil }
        let calendar = Calendar.current
        let components = calendar.dateComponents([.day], from: Date(), to: trialEndsAt)
        return max(0, components.day ?? 0)
    }
}

// MARK: - Usage Info

struct UsageInfo: Codable {
    let dailyPromptsUsed: Int
    let dailyPromptsLimit: Int
    let canCreatePrompt: Bool

    var isUnlimited: Bool {
        dailyPromptsLimit == -1
    }

    var remainingPrompts: Int {
        if isUnlimited { return Int.max }
        return max(0, dailyPromptsLimit - dailyPromptsUsed)
    }

    var usagePercentage: Double {
        if isUnlimited { return 0 }
        guard dailyPromptsLimit > 0 else { return 1.0 }
        return Double(dailyPromptsUsed) / Double(dailyPromptsLimit)
    }
}

// MARK: - Subscription Status Response

struct SubscriptionStatusResponse: Codable {
    let subscription: SubscriptionResponse
    let usage: UsageInfo
    let features: TierFeatures
}

struct SubscriptionResponse: Codable {
    let tier: SubscriptionTier
    let status: SubscriptionStatus
    let expiresAt: String?
    let isTrialing: Bool
    let trialEndsAt: String?
}

// MARK: - Verify Purchase Response

struct VerifyPurchaseResponse: Codable {
    let success: Bool
    let subscription: SubscriptionResponse?
    let features: TierFeatures?
}

// MARK: - Trial Response

struct TrialResponse: Codable {
    let success: Bool
    let trialEndDate: String?
    let subscription: SubscriptionResponse?
    let features: TierFeatures?
    let error: String?
}

// MARK: - Trial Eligibility Response

struct TrialEligibilityResponse: Codable {
    let eligible: Bool
    let trialDays: Int
}

// MARK: - Product Info (from backend)

struct ProductInfo: Codable, Identifiable {
    let productId: String
    let tier: String
    let name: String
    let price: Double
    let period: String
    let savings: String?
    let hasTrial: Bool?
    let trialEligible: Bool?
    let features: TierFeatureLimits

    var id: String { productId }

    var subscriptionTier: SubscriptionTier {
        SubscriptionTier(rawValue: tier) ?? .free
    }

    var isAnnual: Bool {
        period == "year"
    }

    var monthlyEquivalent: Double {
        if isAnnual {
            return price / 12.0
        }
        return price
    }
}

struct TierFeatureLimits: Codable {
    let dailyPrompts: Int
    let promptQuality: String
    let canExport: Bool
    let maxTokensPerPrompt: Int

    var isUnlimited: Bool {
        dailyPrompts == -1
    }
}

// MARK: - Products Response

struct ProductsResponse: Codable {
    let products: [ProductInfo]
    let trialEligible: Bool
}

// MARK: - Restore Response

struct RestoreResponse: Codable {
    let success: Bool
    let restored: Bool
    let message: String?
    let subscription: SubscriptionResponse?
    let features: TierFeatures?
}

// MARK: - Product IDs

enum ProductID: String, CaseIterable {
    case proMonthly = "com.promptomizer.pro.monthly"
    case proAnnual = "com.promptomizer.pro.annual"
    case premiumMonthly = "com.promptomizer.premium.monthly"
    case premiumAnnual = "com.promptomizer.premium.annual"

    var tier: SubscriptionTier {
        switch self {
        case .proMonthly, .proAnnual: return .pro
        case .premiumMonthly, .premiumAnnual: return .premium
        }
    }

    var isAnnual: Bool {
        self == .proAnnual || self == .premiumAnnual
    }

    static var allProductIds: [String] {
        allCases.map { $0.rawValue }
    }
}

// MARK: - Quota Error

struct QuotaError: Codable {
    let error: String
    let code: String
    let message: String
    let remainingQuota: Int?

    var isQuotaExceeded: Bool {
        code == "QUOTA_EXCEEDED"
    }

    var isFeatureLocked: Bool {
        code == "FEATURE_LOCKED"
    }
}
