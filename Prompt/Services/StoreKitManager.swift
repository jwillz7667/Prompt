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
        updateListenerTask = listenForTransactions()
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
                await syncTransactionWithBackend(jwsRepresentation: verification.jwsRepresentation)

                // Finish the transaction
                await transaction.finish()

                // Refresh entitlements
                await checkEntitlements()

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
                isTrialing: response.subscription.isTrialing,
                trialEndsAt: trialEndsAt,
                features: response.features
            )

            self.usageInfo = response.usage

            // Sync to shared storage for widgets and extensions
            syncToSharedStorage()
        } catch {
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
                        await self?.syncTransactionWithBackend(jwsRepresentation: result.jwsRepresentation)
                        await transaction.finish()
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

    private func syncTransactionWithBackend(jwsRepresentation: String) async {
        do {
            let request = VerifyPurchaseRequest(signedTransaction: jwsRepresentation)
            let _: VerifyPurchaseResponse = try await APIClient.shared.request(
                "/subscriptions/verify",
                method: .post,
                body: request
            )
        } catch {
            #if DEBUG
            print("Failed to verify purchase with backend: \(error)")
            #endif
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

