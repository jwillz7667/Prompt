import Foundation
import StoreKit

@Observable
@MainActor
final class StoreKitManager {
    static let shared = StoreKitManager()

    // MARK: - Published State

    private(set) var products: [Product] = []
    private(set) var purchasedProductIDs: Set<String> = []
    private(set) var subscriptionInfo: AppSubscriptionInfo?
    private(set) var usageInfo: UsageInfo?
    private(set) var isLoading = false
    private(set) var error: StoreError?

    // MARK: - Private Properties

    @ObservationIgnored
    private var updateListenerTask: Task<Void, Error>?
    private let productIds = ProductID.allProductIds

    // MARK: - Computed Properties

    var currentTier: SubscriptionTier {
        subscriptionInfo?.tier ?? .free
    }

    var promptQuality: PromptTier {
        subscriptionInfo?.features.promptTier ?? .basic
    }

    var canCreatePrompt: Bool {
        usageInfo?.canCreatePrompt ?? true
    }

    var dailyPromptsRemaining: Int {
        usageInfo?.remainingPrompts ?? 10
    }

    var isTrialing: Bool {
        subscriptionInfo?.isTrialing ?? false
    }

    var hasActiveSubscription: Bool {
        currentTier != .free && (subscriptionInfo?.isActive ?? false)
    }

    // MARK: - Initialization

    private init() {
        // Optimistically restore the last-known subscription so the UI and
        // widgets show the correct tier immediately on cold start instead of
        // defaulting to FREE until syncWithBackend() completes (or while
        // offline / the backend is briefly unreachable). The network sync
        // refreshes and corrects this shortly after launch.
        if SharedDataManager.shared.isAuthenticated {
            subscriptionInfo = Self.loadCachedSubscriptionInfo()
        }
        updateListenerTask = listenForTransactions()
    }

    // MARK: - Subscription Cache

    private static func loadCachedSubscriptionInfo() -> AppSubscriptionInfo? {
        guard let data = SharedDataManager.shared.cachedSubscriptionData,
              let cached = try? JSONDecoder().decode(AppSubscriptionInfo.self, from: data) else {
            return nil
        }

        // Never resurrect an already-expired entitlement from cache while
        // offline — fall back to FREE rather than show a stale paid tier. A
        // trialing entitlement is bounded by trialEndsAt, a paid one by
        // expiresAt; using expiresAt for a trial (as before) let an ended trial
        // keep showing a paid tier until the next successful network sync.
        let now = Date()
        if cached.isTrialing {
            if let trialEndsAt = cached.trialEndsAt, trialEndsAt < now {
                return nil
            }
        } else if let expiresAt = cached.expiresAt, expiresAt < now {
            return nil
        }

        return cached
    }

    private func persistSubscriptionCache() {
        guard let info = subscriptionInfo else {
            SharedDataManager.shared.cachedSubscriptionData = nil
            return
        }
        SharedDataManager.shared.cachedSubscriptionData = try? JSONEncoder().encode(info)
    }

    /// Drops all cached subscription state. Called on sign-out so a new or
    /// anonymous session never inherits the previous user's paid tier.
    func clearSubscriptionState() {
        subscriptionInfo = nil
        usageInfo = nil
        purchasedProductIDs = []
        SharedDataManager.shared.cachedSubscriptionData = nil
        SharedDataManager.shared.updateSubscription(tier: SubscriptionTier.free.rawValue)
        // updateSubscription(tier:) does not reload widgets, so without this the
        // widget and keyboard extensions keep showing the signed-out user's paid
        // tier until some other event refreshes them.
        SharedDataManager.shared.reloadWidgets()
    }

    // Note: No deinit needed - this is a singleton that lives for app lifetime
    // The task will be cancelled automatically when the app terminates

    // MARK: - Load Products

    func loadProducts() async {
        isLoading = true
        error = nil

        do {
            products = try await Product.products(for: productIds)
                .sorted { lhs, rhs in
                    // Sort by price ascending
                    lhs.price < rhs.price
                }
            isLoading = false
        } catch {
            self.error = .failedToLoadProducts(error)
            isLoading = false
        }
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async throws -> Transaction? {
        isLoading = true
        error = nil

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)

                // Sync with backend using JWS from the verification result
                let outcome = await syncTransactionWithBackend(jwsRepresentation: verification.jwsRepresentation)

                // Only finish once the backend has resolved the transaction
                // (granted, or permanently rejected). Left unfinished,
                // StoreKit redelivers it via Transaction.updates /
                // Transaction.unfinished, so a transient activation failure
                // retries on next launch or after sign-in instead of being
                // dropped forever.
                if outcome != .retryLater {
                    await transaction.finish()
                }

                // Refresh entitlements (also retries pending activations)
                await checkEntitlements()

                if outcome != .accepted, await APIClient.shared.isAuthenticated, !hasActiveSubscription {
                    // Purchase succeeded at Apple but activation on the
                    // account failed and the entitlement still isn't active —
                    // surface it instead of showing success over still-locked
                    // features.
                    let activationError = StoreError.activationFailed
                    self.error = activationError
                    isLoading = false
                    throw activationError
                }

                isLoading = false
                return transaction

            case .userCancelled:
                isLoading = false
                return nil

            case .pending:
                isLoading = false
                throw StoreError.purchasePending

            @unknown default:
                isLoading = false
                throw StoreError.unknownPurchaseResult
            }
        } catch {
            isLoading = false
            ErrorHandler.shared.handle(error, context: "purchase")
            if let storeError = error as? StoreError {
                self.error = storeError
                throw storeError
            }
            self.error = .purchaseFailed(error)
            throw StoreError.purchaseFailed(error)
        }
    }

    // MARK: - Check Entitlements

    func checkEntitlements() async {
        // Purchases whose backend activation failed (offline, signed out,
        // server error) are intentionally left unfinished — retry them first
        // so the status sync below reflects the recovered entitlement.
        await activatePendingTransactions()

        var purchasedIds: Set<String> = []

        // Check current entitlements
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)

                if transaction.revocationDate == nil {
                    purchasedIds.insert(transaction.productID)
                }
            } catch {
                #if DEBUG
                print("Failed to verify transaction: \(error)")
                #endif
            }
        }

        self.purchasedProductIDs = purchasedIds

        // Sync with backend to get authoritative subscription info
        await syncWithBackend()
    }

    /// Re-attempts backend activation for transactions that were never
    /// finished because the backend sync failed at purchase time. Finishes
    /// each transaction only once the backend accepts it.
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

    // MARK: - Restore Purchases

    func restorePurchases() async throws {
        isLoading = true
        error = nil

        do {
            // Sync with App Store (works without backend auth)
            try await AppStore.sync()

            // Collect all valid transactions
            var signedTransactions: [String] = []

            for await result in Transaction.currentEntitlements {
                if case .verified = result {
                    signedTransactions.append(result.jwsRepresentation)
                }
            }

            // Send to backend for restoration only if authenticated
            if !signedTransactions.isEmpty, await APIClient.shared.isAuthenticated {
                let request = RestorePurchasesRequest(signedTransactions: signedTransactions)
                let response: RestoreResponse = try await APIClient.shared.request(
                    "/subscriptions/restore",
                    method: .post,
                    body: request
                )

                if response.restored {
                    await syncWithBackend()
                }
            }

            // Re-check entitlements (local StoreKit check + conditional backend sync)
            await checkEntitlements()

            isLoading = false
        } catch {
            isLoading = false
            ErrorHandler.shared.handle(error, context: "restorePurchases")
            self.error = .restoreFailed(error)
            throw StoreError.restoreFailed(error)
        }
    }

    // MARK: - Sync with Backend

    func syncWithBackend() async {
        // Skip sync if user is not authenticated
        guard await APIClient.shared.isAuthenticated else {
            return
        }

        do {
            let response: SubscriptionStatusResponse = try await APIClient.shared.request(
                "/subscriptions/status",
                method: .get
            )

            let dateFormatter = ISO8601DateFormatter()
            dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

            let expiresAt = response.subscription.expiresAt.flatMap { dateFormatter.date(from: $0) }
            let trialEndsAt = response.subscription.trialEndsAt.flatMap { dateFormatter.date(from: $0) }

            self.subscriptionInfo = AppSubscriptionInfo(
                tier: response.subscription.tier,
                status: response.subscription.status,
                expiresAt: expiresAt,
                isTrialing: response.subscription.isTrialing ?? false,
                trialEndsAt: trialEndsAt,
                features: response.features
            )

            self.usageInfo = response.usage

            // Persist the fresh snapshot so the next cold start restores the
            // correct tier even before the network responds.
            persistSubscriptionCache()

            // Sync to shared storage for widgets and extensions
            syncToSharedStorage()
        } catch {
            // Keep the last-known subscriptionInfo on failure — a transient
            // network/backend error must not drop the user to FREE.
            ErrorHandler.shared.handleSilently(error, context: "syncWithBackend")
        }
    }

    // MARK: - Shared Storage Sync

    private func syncToSharedStorage() {
        let shared = SharedDataManager.shared

        // Update quota data
        if let usage = usageInfo {
            shared.updateQuota(used: usage.dailyPromptsUsed, limit: usage.dailyPromptsLimit)
        }

        // Update subscription tier
        if let sub = subscriptionInfo {
            shared.updateSubscription(tier: sub.tier.rawValue)
        }

        // Reload widgets to reflect updated data
        shared.reloadWidgets()
    }

    // MARK: - Start Free Trial

    func startFreeTrial() async throws {
        isLoading = true
        error = nil

        do {
            let response: TrialResponse = try await APIClient.shared.request(
                "/subscriptions/trial",
                method: .post
            )

            if response.success {
                await syncWithBackend()
            } else {
                throw StoreError.trialNotAvailable(response.error ?? "Trial not available")
            }

            isLoading = false
        } catch {
            isLoading = false
            ErrorHandler.shared.handle(error, context: "startFreeTrial")
            if let storeError = error as? StoreError {
                self.error = storeError
                throw storeError
            }
            self.error = .trialFailed(error)
            throw StoreError.trialFailed(error)
        }
    }

    // MARK: - Check Trial Eligibility

    func checkTrialEligibility() async -> Bool {
        do {
            let response: TrialEligibilityResponse = try await APIClient.shared.request(
                "/subscriptions/trial/eligibility",
                method: .get
            )
            return response.eligible
        } catch {
            return false
        }
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                do {
                    let transaction = try await self?.checkVerified(result)

                    if let transaction = transaction {
                        // Finish only after the backend resolves the
                        // transaction (accepted or permanently rejected);
                        // otherwise StoreKit redelivers it on the next launch
                        // and activation is retried.
                        let outcome = await self?.syncTransactionWithBackend(
                            jwsRepresentation: result.jwsRepresentation
                        )
                        if let outcome, outcome != .retryLater {
                            await transaction.finish()
                        }
                        await self?.checkEntitlements()
                    }
                } catch {
                    #if DEBUG
                    print("Transaction listener error: \(error)")
                    #endif
                }
            }
        }
    }

    // MARK: - Verify Transaction

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    // MARK: - Sync Transaction with Backend

    /// Outcome of a backend activation attempt for a signed transaction.
    /// Determines whether the StoreKit transaction may be finished: finishing
    /// on `.retryLater` would drop the purchase forever, while never
    /// finishing on `.rejected` would re-verify a permanently invalid
    /// transaction on every launch.
    private enum PurchaseSyncOutcome {
        case accepted
        case rejected
        case retryLater
    }

    /// Sends the signed transaction to the backend for verification and
    /// entitlement grant.
    private func syncTransactionWithBackend(jwsRepresentation: String) async -> PurchaseSyncOutcome {
        guard await APIClient.shared.isAuthenticated else {
            // No session — the backend has no account to attach the purchase
            // to. The unfinished transaction is retried after sign-in via
            // activatePendingTransactions().
            return .retryLater
        }

        do {
            let response: VerifyPurchaseResponse = try await APIClient.shared.request(
                "/subscriptions/verify",
                method: .post,
                body: VerifyPurchaseRequest(signedTransaction: jwsRepresentation)
            )
            return response.success ? .accepted : .rejected
        } catch APIError.decodingError {
            // The server returned 200 — the entitlement was granted; only the
            // response shape drifted. Treat as accepted so the transaction
            // finishes instead of re-verifying forever.
            ErrorHandler.shared.handleSilently(APIError.decodingError, context: "syncTransactionWithBackend")
            return .accepted
        } catch let error as APIError {
            ErrorHandler.shared.handleSilently(error, context: "syncTransactionWithBackend")
            switch error {
            case .badRequest:
                // Apple itself rejected the signed transaction — permanent.
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

    // MARK: - Product Helpers

    func product(for productId: ProductID) -> Product? {
        products.first { $0.id == productId.rawValue }
    }

    func formattedPrice(for product: Product) -> String {
        product.displayPrice
    }

    func monthlyEquivalent(for product: Product) -> String? {
        guard let productId = ProductID(rawValue: product.id), productId.isAnnual else {
            return nil
        }

        let monthlyPrice = product.price / 12
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = product.priceFormatStyle.locale

        return formatter.string(from: monthlyPrice as NSDecimalNumber)
    }

    // Group products by tier
    var proProducts: [Product] {
        products.filter { ProductID(rawValue: $0.id)?.tier == .pro }
    }

    var premiumProducts: [Product] {
        products.filter { ProductID(rawValue: $0.id)?.tier == .premium }
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
    case restoreFailed(Error)
    case trialNotAvailable(String)
    case trialFailed(Error)

    var errorDescription: String? {
        switch self {
        case .failedToLoadProducts(let error):
            return "Failed to load products: \(error.localizedDescription)"
        case .purchaseFailed(let error):
            return "Purchase failed: \(error.localizedDescription)"
        case .purchasePending:
            return "Purchase is pending approval"
        case .failedVerification:
            return "Transaction verification failed"
        case .unknownPurchaseResult:
            return "Unknown purchase result"
        case .activationFailed:
            return "Your purchase went through, but we couldn't activate it on your account. It will retry automatically — or tap Restore Purchase."
        case .restoreFailed(let error):
            return "Failed to restore purchases: \(error.localizedDescription)"
        case .trialNotAvailable(let message):
            return message
        case .trialFailed(let error):
            return "Failed to start trial: \(error.localizedDescription)"
        }
    }
}

// MARK: - Request Models

private struct VerifyPurchaseRequest: Encodable {
    let signedTransaction: String
}

private struct RestorePurchasesRequest: Encodable {
    let signedTransactions: [String]
}

