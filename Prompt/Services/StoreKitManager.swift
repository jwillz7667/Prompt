import Foundation
import StoreKit

/// Owns App Store products, purchases and the app-wide `EntitlementState`.
///
/// Entitlement is decided by the backend (`GET /subscriptions/status`
/// `isEntitled`). The only local fallback is an unexpired cached snapshot,
/// used when the server cannot be reached; the app never fails open.
@Observable
@MainActor
final class StoreKitManager {
    static let shared = StoreKitManager()

    enum ProductLoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed
    }

    enum PurchaseResult {
        case activated
        case cancelled
    }

    // MARK: - Observable State

    private(set) var entitlementState: EntitlementState = .unknown
    /// True when entitlement is still `.unknown` because the last check could
    /// not reach the server and no unexpired cached entitlement existed.
    private(set) var entitlementCheckFailed = false
    private(set) var isCheckingEntitlement = false
    private(set) var products: [Product] = []
    private(set) var productLoadState: ProductLoadState = .idle
    private(set) var subscriptionInfo: AppSubscriptionInfo?
    private(set) var usageInfo: UsageInfo?
    private(set) var billingProvider: String?
    /// Nil when the backend did not report renewal state.
    private(set) var isAutoRenewEnabled: Bool?
    private(set) var purchasedProductIDs: Set<String> = []
    private(set) var isPurchasing = false
    /// A problem found outside a user action (silent restore, transaction
    /// listener) that the paywall should explain.
    private(set) var activationNotice: StoreError?

    // MARK: - Private State

    @ObservationIgnored
    private var updateListenerTask: Task<Void, Never>?
    @ObservationIgnored
    private var entitlementRefreshTask: Task<Void, Never>?
    /// The silent restore runs at most once per launch (and per account).
    @ObservationIgnored
    private var didAttemptSelfHeal = false

    // MARK: - Derived State

    var isEntitled: Bool { entitlementState.isEntitled }

    var hasActiveSubscription: Bool { isEntitled }

    var currentTier: SubscriptionTier { isEntitled ? .premium : .free }

    var isTrialing: Bool {
        if case .entitled(_, let isTrialing) = entitlementState { return isTrialing }
        return false
    }

    var premiumProduct: Product? {
        products.first { $0.id == ProductID.onSale.rawValue }
    }

    // MARK: - Initialization

    private init() {
        updateListenerTask = listenForTransactions()
    }

    // MARK: - Entitlement

    /// Re-derives `entitlementState` from the backend. Concurrent callers
    /// (launch, foreground, transaction updates) share one in-flight check.
    func refreshEntitlement() async {
        if let inFlight = entitlementRefreshTask {
            await inFlight.value
            return
        }
        let task = Task { await performEntitlementRefresh() }
        entitlementRefreshTask = task
        await task.value
        entitlementRefreshTask = nil
    }

    /// Kept for call sites that predate `refreshEntitlement()`.
    func syncWithBackend() async {
        await refreshEntitlement()
    }

    /// Called when any API route answers 403 SUBSCRIPTION_REQUIRED. Drops
    /// access immediately, then re-checks in case a purchase can be restored.
    func handleSubscriptionRequired() {
        entitlementState = .notEntitled
        entitlementCheckFailed = false
        if let info = subscriptionInfo, info.isEntitled {
            subscriptionInfo = nil
        }
        SharedDataManager.shared.cachedSubscriptionData = nil
        syncToSharedStorage()
        Task { await refreshEntitlement() }
    }

    private func performEntitlementRefresh() async {
        guard await APIClient.shared.isAuthenticated, !AuthManager.shared.isSessionExpired else {
            entitlementState = .unknown
            entitlementCheckFailed = false
            return
        }

        let sessionVersion = await APIClient.shared.sessionVersion
        isCheckingEntitlement = true
        defer { isCheckingEntitlement = false }

        // Purchases whose backend activation failed earlier are left
        // unfinished; retry them first so the status below reflects them.
        await activatePendingTransactions()
        let localEntitlements = await verifiedLocalEntitlements()
        guard await APIClient.shared.sessionVersion == sessionVersion else { return }
        purchasedProductIDs = Set(localEntitlements.map(\.productID))

        do {
            var status = try await fetchStatus()
            if !status.resolvedIsEntitled, !didAttemptSelfHeal, !localEntitlements.isEmpty {
                didAttemptSelfHeal = true
                if await silentlyRestore(signedTransactions: localEntitlements.map(\.jws)) {
                    status = try await fetchStatus()
                }
            }
            guard await APIClient.shared.sessionVersion == sessionVersion else { return }
            apply(status)
            entitlementCheckFailed = false
        } catch {
            guard await APIClient.shared.sessionVersion == sessionVersion else { return }
            ErrorHandler.shared.handleSilently(error, context: "refreshEntitlement")
            applyOfflineFallback(after: error)
        }
    }

    /// The server could not be reached: keep a still-valid entitlement, fall
    /// back to an unexpired cached snapshot, and otherwise stay `.unknown`.
    private func applyOfflineFallback(after error: Error) {
        if let apiError = error as? APIError {
            switch apiError {
            case .unauthorized, .notAuthenticated:
                entitlementState = .unknown
                entitlementCheckFailed = false
                return
            default:
                break
            }
        }

        let now = Date()
        if let current = subscriptionInfo, current.grantsAccess(at: now) {
            entitlementState = current.entitlementState
            entitlementCheckFailed = false
            return
        }
        if let cached = Self.loadCachedSubscriptionInfo(), cached.grantsAccess(at: now) {
            subscriptionInfo = cached
            entitlementState = cached.entitlementState
            entitlementCheckFailed = false
            return
        }
        if case .notEntitled = entitlementState { return }
        entitlementState = .unknown
        entitlementCheckFailed = true
    }

    private func fetchStatus() async throws -> SubscriptionStatusResponse {
        try await APIClient.shared.request("/subscriptions/status", method: .get)
    }

    private func apply(_ status: SubscriptionStatusResponse) {
        let info = AppSubscriptionInfo(
            response: status.subscription,
            isEntitled: status.resolvedIsEntitled,
            productId: status.productId
        )
        subscriptionInfo = info
        entitlementState = info.entitlementState
        usageInfo = status.usage
        billingProvider = status.billingProvider
        isAutoRenewEnabled = status.autoRenewEnabled
        if info.isEntitled {
            activationNotice = nil
        }
        persistSubscriptionCache()
        syncToSharedStorage()
    }

    private func verifiedLocalEntitlements() async -> [(productID: String, jws: String)] {
        var entitlements: [(productID: String, jws: String)] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  ProductID.entitlementProductIds.contains(transaction.productID),
                  transaction.revocationDate == nil,
                  !transaction.isUpgraded else { continue }
            entitlements.append((transaction.productID, result.jwsRepresentation))
        }
        return entitlements
    }

    /// Server says not entitled but this device holds a verified App Store
    /// entitlement (e.g. activation never reached the backend). Returns true
    /// when the backend accepted the restore.
    private func silentlyRestore(signedTransactions: [String]) async -> Bool {
        do {
            let response: RestoreResponse = try await APIClient.shared.request(
                "/subscriptions/restore",
                method: .post,
                body: RestorePurchasesRequest(signedTransactions: signedTransactions)
            )
            return response.success && response.restored
        } catch APIError.transactionOwnedByAnotherAccount {
            activationNotice = .ownedByAnotherAccount
            return false
        } catch {
            ErrorHandler.shared.handleSilently(error, context: "silentRestore")
            return false
        }
    }

    // MARK: - Subscription Cache

    private static func loadCachedSubscriptionInfo() -> AppSubscriptionInfo? {
        guard let data = SharedDataManager.shared.cachedSubscriptionData else { return nil }
        return try? JSONDecoder().decode(AppSubscriptionInfo.self, from: data)
    }

    private func persistSubscriptionCache() {
        guard let info = subscriptionInfo, info.isEntitled else {
            SharedDataManager.shared.cachedSubscriptionData = nil
            return
        }
        SharedDataManager.shared.cachedSubscriptionData = try? JSONEncoder().encode(info)
    }

    /// Drops all subscription state. Called on sign-out and session expiry so
    /// a different account never inherits the previous user's entitlement.
    func clearSubscriptionState() {
        entitlementState = .unknown
        entitlementCheckFailed = false
        subscriptionInfo = nil
        usageInfo = nil
        billingProvider = nil
        isAutoRenewEnabled = nil
        purchasedProductIDs = []
        activationNotice = nil
        didAttemptSelfHeal = false
        SharedDataManager.shared.cachedSubscriptionData = nil
        syncToSharedStorage()
    }

    // MARK: - Products

    func loadProducts() async {
        guard productLoadState != .loading else { return }
        productLoadState = .loading
        do {
            let loaded = try await Product.products(for: [ProductID.onSale.rawValue])
            products = loaded
            productLoadState = loaded.isEmpty ? .failed : .loaded
        } catch {
            ErrorHandler.shared.handleSilently(StoreError.failedToLoadProducts(error), context: "loadProducts")
            productLoadState = .failed
        }
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async throws -> PurchaseResult {
        guard await APIClient.shared.isAuthenticated, !AuthManager.shared.isSessionExpired else {
            throw StoreError.signInRequired
        }
        guard product.id == ProductID.onSale.rawValue else { throw StoreError.failedVerification }
        guard !isPurchasing else { return .cancelled }

        let purchaseSessionVersion = await APIClient.shared.sessionVersion
        isPurchasing = true
        defer { isPurchasing = false }

        do {
            let accountToken = try await AuthManager.shared.resolveAppAccountToken()

            // Confirms the account and backend are reachable before charging,
            // and blocks a second subscription for web-billed accounts.
            apply(try await fetchStatus())
            guard billingProvider != "stripe" || !isEntitled else {
                throw StoreError.managedOnWeb
            }
            // Already subscribed (e.g. purchased on another device): never
            // charge twice.
            if isEntitled {
                return .activated
            }
            guard await APIClient.shared.sessionVersion == purchaseSessionVersion else {
                throw StoreError.signInRequired
            }

            let result = try await product.purchase(options: [.appAccountToken(accountToken)])

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)

                // A purchase sheet can outlive the signed-in session. Never
                // attach its result to a different account.
                guard await APIClient.shared.sessionVersion == purchaseSessionVersion else {
                    throw StoreError.activationFailed
                }

                let outcome = await syncTransactionWithBackend(jwsRepresentation: verification.jwsRepresentation)
                // Unfinished transactions are redelivered by StoreKit, so a
                // transient activation failure retries instead of being lost.
                if outcome != .retryLater {
                    await transaction.finish()
                }
                await refreshEntitlement()

                switch outcome {
                case .accepted:
                    return .activated
                case .ownedByAnotherAccount:
                    throw StoreError.ownedByAnotherAccount
                case .rejected:
                    throw StoreError.failedVerification
                case .retryLater:
                    throw StoreError.activationFailed
                }

            case .userCancelled:
                return .cancelled

            case .pending:
                throw StoreError.purchasePending

            @unknown default:
                throw StoreError.unknownPurchaseResult
            }
        } catch let error as StoreError {
            ErrorHandler.shared.handleSilently(error, context: "purchase")
            throw error
        } catch {
            ErrorHandler.shared.handleSilently(error, context: "purchase")
            throw StoreError.purchaseFailed(error)
        }
    }

    // MARK: - Restore Purchases

    func restorePurchases() async throws {
        guard await APIClient.shared.isAuthenticated, !AuthManager.shared.isSessionExpired else {
            throw StoreError.signInRequired
        }
        let restoreSessionVersion = await APIClient.shared.sessionVersion

        do {
            try await AppStore.sync()

            let signedTransactions = await verifiedLocalEntitlements().map(\.jws)
            guard await APIClient.shared.sessionVersion == restoreSessionVersion else {
                throw StoreError.signInRequired
            }
            guard !signedTransactions.isEmpty else { throw StoreError.noActivePurchases }

            let response: RestoreResponse
            do {
                response = try await APIClient.shared.request(
                    "/subscriptions/restore",
                    method: .post,
                    body: RestorePurchasesRequest(signedTransactions: signedTransactions)
                )
            } catch APIError.transactionOwnedByAnotherAccount {
                throw StoreError.ownedByAnotherAccount
            }

            guard response.success, response.restored else {
                throw StoreError.restoreRejected(response.message ?? StoreError.noActivePurchases.localizedDescription)
            }
            guard await APIClient.shared.sessionVersion == restoreSessionVersion else {
                throw StoreError.signInRequired
            }
            await refreshEntitlement()
        } catch let error as StoreError {
            ErrorHandler.shared.handleSilently(error, context: "restorePurchases")
            throw error
        } catch {
            ErrorHandler.shared.handleSilently(error, context: "restorePurchases")
            throw StoreError.restoreFailed(error)
        }
    }

    // MARK: - Pending Activations

    /// Re-attempts backend activation for transactions left unfinished
    /// because the backend could not be reached at purchase time.
    private func activatePendingTransactions() async {
        guard await APIClient.shared.isAuthenticated else { return }

        for await result in Transaction.unfinished {
            guard case .verified(let transaction) = result else { continue }

            let outcome = await syncTransactionWithBackend(jwsRepresentation: result.jwsRepresentation)
            if outcome != .retryLater {
                await transaction.finish()
            }
        }
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = result else { continue }

                let outcome = await self.syncTransactionWithBackend(jwsRepresentation: result.jwsRepresentation)
                if outcome != .retryLater {
                    await transaction.finish()
                }
                await self.refreshEntitlement()
            }
        }
    }

    // MARK: - Verification

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    // MARK: - Backend Activation

    /// Outcome of a backend activation attempt. Determines whether the
    /// StoreKit transaction may be finished: finishing on `.retryLater` would
    /// drop the purchase, while never finishing a permanent failure would
    /// redeliver it on every launch.
    private enum PurchaseSyncOutcome {
        case accepted
        case rejected
        /// The App Store subscription is linked to another account. Retrying
        /// from this account can never succeed.
        case ownedByAnotherAccount
        case retryLater
    }

    private func syncTransactionWithBackend(jwsRepresentation: String) async -> PurchaseSyncOutcome {
        guard await APIClient.shared.isAuthenticated else {
            // No account to attach the purchase to yet; activation retries
            // after sign-in via activatePendingTransactions().
            return .retryLater
        }

        let requestedSessionVersion = await APIClient.shared.sessionVersion
        do {
            let response: VerifyPurchaseResponse = try await APIClient.shared.request(
                "/subscriptions/verify",
                method: .post,
                body: VerifyPurchaseRequest(signedTransaction: jwsRepresentation)
            )
            guard await APIClient.shared.sessionVersion == requestedSessionVersion else {
                return .retryLater
            }
            guard response.success, let subscription = response.subscription else { return .retryLater }
            guard response.activationConfirmed else { return .rejected }

            let info = AppSubscriptionInfo(response: subscription, isEntitled: true, productId: nil)
            subscriptionInfo = info
            entitlementState = info.entitlementState
            activationNotice = nil
            persistSubscriptionCache()
            syncToSharedStorage()
            return .accepted
        } catch let error as APIError {
            ErrorHandler.shared.handleSilently(error, context: "syncTransactionWithBackend")
            switch error {
            case .transactionOwnedByAnotherAccount:
                activationNotice = .ownedByAnotherAccount
                return .ownedByAnotherAccount
            case .badRequest:
                return .rejected
            case .serverMessage(_, let code) where code == 400 || code == 422:
                return .rejected
            default:
                return .retryLater
            }
        } catch {
            ErrorHandler.shared.handleSilently(error, context: "syncTransactionWithBackend")
            return .retryLater
        }
    }

    // MARK: - Shared Storage

    /// Widgets and App Intents read the entitlement through the App Group.
    private func syncToSharedStorage() {
        let tier: SubscriptionTier = isEntitled ? .premium : .free
        SharedDataManager.shared.updateSubscription(tier: tier.rawValue)
        SharedDataManager.shared.reloadWidgets()
    }
}

// MARK: - Store Errors

enum StoreError: LocalizedError {
    case failedToLoadProducts(Error)
    case purchaseFailed(Error)
    case purchasePending
    case failedVerification
    case unknownPurchaseResult
    case activationFailed
    case accountNotReady
    case signInRequired
    case managedOnWeb
    case noActivePurchases
    case ownedByAnotherAccount
    case restoreRejected(String)
    case restoreFailed(Error)

    var errorDescription: String? {
        switch self {
        case .failedToLoadProducts:
            return String(localized: "Subscription options couldn't be loaded. Check your connection and try again.")
        case .purchaseFailed(let error):
            return String(localized: "Purchase failed: \(error.localizedDescription)")
        case .purchasePending:
            return String(localized: "Your purchase is pending approval. Premium unlocks as soon as it's approved.")
        case .failedVerification:
            return String(localized: "The App Store couldn't verify this purchase. Please try again.")
        case .unknownPurchaseResult:
            return String(localized: "The purchase didn't complete. Please try again.")
        case .accountNotReady:
            return String(localized: "Your account isn't ready for purchases yet. Check your connection and try again.")
        case .managedOnWeb:
            return String(localized: "This account already has a subscription billed on the web. Manage that plan on the Promptomize website to avoid a second subscription.")
        case .signInRequired:
            return String(localized: "Sign in to the account you want to use for this subscription.")
        case .noActivePurchases:
            return String(localized: "No active App Store subscriptions were found for this Apple Account.")
        case .ownedByAnotherAccount:
            return ServiceMessages.transactionOwnedByAnotherAccount
        case .restoreRejected(let message):
            return message
        case .activationFailed:
            return String(localized: "Your purchase went through, but we couldn't activate it yet. It will retry automatically, or tap Restore Purchases.")
        case .restoreFailed(let error):
            return String(localized: "Restore failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Request Models

private nonisolated struct VerifyPurchaseRequest: Encodable, Sendable {
    let signedTransaction: String
}

private nonisolated struct RestorePurchasesRequest: Encodable, Sendable {
    let signedTransactions: [String]
}
