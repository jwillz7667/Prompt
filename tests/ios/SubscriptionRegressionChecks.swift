import Foundation

@main
struct SubscriptionRegressionChecks {
    static func main() throws {
        let validURL = APIConfiguration.normalizedBaseURL(" https://api.example.com/api/v1/ ")
        precondition(validURL?.absoluteString == "https://api.example.com/api/v1")
        for invalidURL in [
            "http://api.example.com/api/v1", "https://api.example.com",
            "https://user:password@api.example.com/api/v1",
            "https://api.example.com/api/v1?token=secret", "https://api.example.com/api/v1#fragment"
        ] {
            precondition(APIConfiguration.normalizedBaseURL(invalidURL) == nil)
        }

        func decode(_ json: String) throws -> VerifyPurchaseResponse {
            try JSONDecoder().decode(VerifyPurchaseResponse.self, from: Data(json.utf8))
        }
        let legacyResponse = try decode(#"{"success":true,"subscription":{"tier":"PRO","status":"ACTIVE","expiresAt":"2026-12-01T00:00:00Z"},"features":{"promptQuality":"standard","canExport":true,"maxTokensPerPrompt":4096}}"#)
        precondition(legacyResponse.activationConfirmed)
        precondition(legacyResponse.subscription?.isTrialing == nil)
        let missingEntitlement = try decode(#"{"success":true}"#)
        let rejected = try decode(#"{"success":false}"#)
        precondition(!missingEntitlement.activationConfirmed)
        precondition(!rejected.activationConfirmed)
        let expired = try decode(#"{"success":true,"subscription":{"tier":"PRO","status":"EXPIRED"},"features":{"promptQuality":"standard","canExport":true,"maxTokensPerPrompt":4096}}"#)
        precondition(!expired.activationConfirmed)
        let free = try decode(#"{"success":true,"subscription":{"tier":"FREE","status":"ACTIVE"},"features":{"promptQuality":"basic","canExport":false,"maxTokensPerPrompt":2048}}"#)
        precondition(!free.activationConfirmed)

        try checkLegacyProDecodesAsPremium()
        try checkServerEntitlementFlagOverridesTier()
        checkCachedSnapshotNeverGrantsAccessAfterItEnds()

        print("iOS configuration and subscription regressions passed")
    }

    /// Grandfathered Pro subscribers keep full access: "PRO" is Premium.
    static func checkLegacyProDecodesAsPremium() throws {
        let status = try JSONDecoder().decode(
            SubscriptionStatusResponse.self,
            from: Data(#"{"subscription":{"tier":"PRO","status":"ACTIVE","expiresAt":"2099-01-01T00:00:00Z"}}"#.utf8)
        )
        precondition(status.subscription.tier == .premium)
        precondition(status.subscription.tier.displayName == "Premium")
        precondition(status.resolvedIsEntitled)
        let lowercase = try JSONDecoder().decode(SubscriptionTier.self, from: Data(#""pro""#.utf8))
        precondition(lowercase == .premium)
    }

    /// The backend's `isEntitled` is authoritative over tier and status.
    static func checkServerEntitlementFlagOverridesTier() throws {
        func status(_ json: String) throws -> SubscriptionStatusResponse {
            try JSONDecoder().decode(SubscriptionStatusResponse.self, from: Data(json.utf8))
        }
        let trialingFree = try status(#"{"isEntitled":true,"subscription":{"tier":"FREE","status":"ACTIVE","isTrialing":true,"trialEndsAt":"2099-01-01T00:00:00Z"}}"#)
        precondition(trialingFree.resolvedIsEntitled)
        let revokedPremium = try status(#"{"isEntitled":false,"subscription":{"tier":"PREMIUM","status":"ACTIVE","expiresAt":"2099-01-01T00:00:00Z"}}"#)
        precondition(!revokedPremium.resolvedIsEntitled)
        let nestedFlag = try status(#"{"subscription":{"tier":"PREMIUM","status":"ACTIVE","isEntitled":false}}"#)
        precondition(!nestedFlag.resolvedIsEntitled)

        let info = AppSubscriptionInfo(
            response: revokedPremium.subscription,
            isEntitled: revokedPremium.resolvedIsEntitled,
            productId: revokedPremium.productId
        )
        precondition(info.entitlementState == .notEntitled)
    }

    /// The offline fallback must never let an ended or open-ended snapshot in.
    static func checkCachedSnapshotNeverGrantsAccessAfterItEnds() {
        let now = Date()
        func snapshot(expiresAt: Date?, isTrialing: Bool = false, trialEndsAt: Date? = nil, isEntitled: Bool = true) -> AppSubscriptionInfo {
            AppSubscriptionInfo(
                tier: .premium,
                status: .active,
                expiresAt: expiresAt,
                isTrialing: isTrialing,
                trialEndsAt: trialEndsAt,
                productId: ProductID.premiumMonthly.rawValue,
                isEntitled: isEntitled
            )
        }
        precondition(snapshot(expiresAt: now.addingTimeInterval(3600)).grantsAccess(at: now))
        precondition(!snapshot(expiresAt: now.addingTimeInterval(-1)).grantsAccess(at: now))
        precondition(!snapshot(expiresAt: nil).grantsAccess(at: now))
        precondition(!snapshot(expiresAt: now.addingTimeInterval(3600), isEntitled: false).grantsAccess(at: now))
        // A trial ends at trialEndsAt even when the paid period would run longer.
        let endedTrial = snapshot(
            expiresAt: now.addingTimeInterval(30 * 86_400),
            isTrialing: true,
            trialEndsAt: now.addingTimeInterval(-60)
        )
        precondition(!endedTrial.grantsAccess(at: now))

        // The cache round-trips through JSON; decoding must not revive access.
        let encoded = try? JSONEncoder().encode(snapshot(expiresAt: now.addingTimeInterval(-60)))
        let decoded = encoded.flatMap { try? JSONDecoder().decode(AppSubscriptionInfo.self, from: $0) }
        precondition(decoded != nil && decoded?.grantsAccess(at: now) == false)
    }
}
