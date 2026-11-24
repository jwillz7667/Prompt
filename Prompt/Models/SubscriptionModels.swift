import Foundation

// MARK: - Subscription Tier

/// Server tier label. Under the hard paywall there is a single paid
/// entitlement (PREMIUM); access decisions use `EntitlementState`, never the
/// tier alone.
nonisolated enum SubscriptionTier: String, Codable, CaseIterable, Sendable {
    case free = "FREE"
    /// Never produced by decoding: legacy "PRO" decodes as `.premium`
    /// because grandfathered Pro subscribers keep full access. The case only
    /// remains so existing `switch` sites outside this module keep compiling
    /// until they are collapsed onto the single entitlement.
    case pro = "PRO"
    case premium = "PREMIUM"

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        switch raw.uppercased() {
        case "PREMIUM", "PRO":
            self = .premium
        default:
            self = .free
        }
    }

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .pro, .premium: return "Premium"
        }
    }
}

// MARK: - Subscription Status

nonisolated enum SubscriptionStatus: String, Codable, Sendable {
    case active = "ACTIVE"
    case expired = "EXPIRED"
    case canceled = "CANCELED"
    case gracePeriod = "GRACE_PERIOD"

    /// Unknown statuses from a newer backend decode as `.expired` so an
    /// unrecognised value can never grant access.
    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SubscriptionStatus(rawValue: raw.uppercased()) ?? .expired
    }

    var isActive: Bool {
        self == .active || self == .gracePeriod
    }
}

// MARK: - Entitlement State

/// Single source of truth for whether AI features may be used. `.unknown`
/// means the app has not yet established entitlement and must not fail open.
nonisolated enum EntitlementState: Equatable, Sendable {
    case unknown
    case entitled(expiresAt: Date?, isTrialing: Bool)
    case notEntitled

    var isEntitled: Bool {
        if case .entitled = self { return true }
        return false
    }
}

// MARK: - App Subscription Info (renamed to avoid conflict with StoreKit.SubscriptionInfo)

nonisolated struct AppSubscriptionInfo: Codable, Sendable, Equatable {
    let tier: SubscriptionTier
    let status: SubscriptionStatus
    let expiresAt: Date?
    let isTrialing: Bool
    let trialEndsAt: Date?
    let productId: String?
    let isEntitled: Bool

    /// The moment access ends: trial end for a trialing subscription,
    /// otherwise the paid period end.
    var accessEndsAt: Date? {
        isTrialing ? (trialEndsAt ?? expiresAt) : expiresAt
    }

    /// Whether this snapshot may still grant access at `date`. Used for the
    /// offline fallback: a cached snapshot whose period has ended never
    /// grants access, and one without an end date is not trusted offline.
    func grantsAccess(at date: Date) -> Bool {
        guard isEntitled, let accessEndsAt else { return false }
        return accessEndsAt > date
    }

    init(
        tier: SubscriptionTier,
        status: SubscriptionStatus,
        expiresAt: Date?,
        isTrialing: Bool,
        trialEndsAt: Date?,
        productId: String?,
        isEntitled: Bool
    ) {
        self.tier = tier
        self.status = status
        self.expiresAt = expiresAt
        self.isTrialing = isTrialing
        self.trialEndsAt = trialEndsAt
        self.productId = productId
        self.isEntitled = isEntitled
    }

    init(response: SubscriptionResponse, isEntitled: Bool, productId: String?) {
        self.init(
            tier: response.tier,
            status: response.status,
            expiresAt: ServerDate.parse(response.expiresAt),
            isTrialing: response.isTrialing ?? false,
            trialEndsAt: ServerDate.parse(response.trialEndsAt),
            productId: productId ?? response.productId,
            isEntitled: isEntitled
        )
    }

    var entitlementState: EntitlementState {
        isEntitled ? .entitled(expiresAt: accessEndsAt, isTrialing: isTrialing) : .notEntitled
    }
}

// MARK: - Usage Info

/// Optional usage counters still reported by the status endpoint. They are
/// informational only; access is governed by `EntitlementState`.
nonisolated struct UsageInfo: Codable, Sendable {
    let maxModeRemaining: Int?
}

// MARK: - Subscription Status Response

nonisolated struct SubscriptionStatusResponse: Decodable, Sendable {
    let subscription: SubscriptionResponse
    let usage: UsageInfo?
    let billingProvider: String?
    let autoRenewEnabled: Bool?
    /// Authoritative entitlement flag. Older backends omit it, in which case
    /// entitlement is derived from tier and status.
    let isEntitled: Bool?
    let productId: String?

    var resolvedIsEntitled: Bool {
        isEntitled ?? subscription.isEntitled ?? subscription.impliesEntitlement
    }
}

nonisolated struct SubscriptionResponse: Codable, Sendable {
    let tier: SubscriptionTier
    let status: SubscriptionStatus
    let expiresAt: String?
    // Optional because not every endpoint includes it (e.g. older backend
    // /verify and /restore responses) — a required key here made the decode
    // throw and successful purchase activations register as failures.
    let isTrialing: Bool?
    let trialEndsAt: String?
    let productId: String?
    let isEntitled: Bool?

    var impliesEntitlement: Bool {
        tier != .free && status.isActive
    }
}

// MARK: - Verify Purchase Response

nonisolated struct VerifyPurchaseResponse: Decodable, Sendable {
    let success: Bool
    let subscription: SubscriptionResponse?

    /// A successful HTTP response alone does not establish an entitlement.
    var activationConfirmed: Bool {
        guard success, let subscription else { return false }
        return subscription.isEntitled ?? subscription.impliesEntitlement
    }
}

// MARK: - Restore Response

nonisolated struct RestoreResponse: Decodable, Sendable {
    let success: Bool
    let restored: Bool
    let message: String?
    let subscription: SubscriptionResponse?
}

// MARK: - Product IDs

nonisolated enum ProductID: String, CaseIterable, Sendable {
    case premiumMonthly = "com.promptomizer.premium.monthly"
    // No longer sold. Kept so grandfathered subscribers' transactions are
    // still recognised by entitlement checks and Restore Purchases.
    case proMonthly = "com.promptomizer.pro.monthly"
    case proAnnual = "com.promptomizer.pro.annual"
    case premiumAnnual = "com.promptomizer.premium.annual"

    /// The only product offered for purchase.
    static let onSale: ProductID = .premiumMonthly

    /// Every product whose transaction grants access (sold and grandfathered).
    static var entitlementProductIds: Set<String> {
        Set(allCases.map(\.rawValue))
    }
}

// MARK: - Date Parsing

nonisolated enum ServerDate {
    static func parse(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }
}
