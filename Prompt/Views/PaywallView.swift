//
//  PaywallView.swift
//  Prompt
//
//  Promptomize Premium subscription screen.
//  - `.hard`: full-screen gate shown by RootView to signed-in users without
//    an active subscription or trial. No close button; the user can restore,
//    subscribe, or sign out to switch accounts.
//  - `.manage`: sheet opened from inside the app. Shows plan status and the
//    system Manage Subscriptions sheet when entitled.
//
//  Brand Colors: Purple (#512AD4) and Cyan (#00FFF9)
//

import SwiftUI
import StoreKit

enum LegalLinks {
    static let termsOfUse = URL(string: "https://promptomize.app/terms")!
    static let privacyPolicy = URL(string: "https://promptomize.app/privacy")!
    static let support = URL(string: "https://promptomize.app/support")!
}

struct PaywallView: View {
    enum Mode {
        case hard
        case manage
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager
    @Environment(StoreKitManager.self) private var storeKit
    @Environment(PromptHistoryManager.self) private var historyManager

    let mode: Mode

    @State private var isEligibleForIntroOffer = false
    @State private var isRestoring = false
    @State private var isSigningOut = false
    @State private var alertMessage: String?
    @State private var isConfirmingAccountDeletion = false

    init(mode: Mode = .manage) {
        self.mode = mode
    }

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.adaptiveButtonPrimary }
    private var brandPurple: Color { colorScheme == .dark ? Color.brandPurple : Color.brandPurpleDark }
    private var warningColor: Color {
        colorScheme == .dark ? Color(red: 255/255, green: 159/255, blue: 10/255) : Color(red: 0.75, green: 0.45, blue: 0.0)
    }

    private var isBusy: Bool {
        storeKit.isPurchasing || isRestoring || isSigningOut
    }

    private var showsManagement: Bool {
        mode == .manage && storeKit.isEntitled
    }

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            ScrollView {
                VStack(spacing: 18) {
                    header

                    if showsManagement {
                        managementCard
                        restoreButton
                        legalLinks
                    } else {
                        heroCard
                        if let notice = storeKit.activationNotice {
                            noticeBanner(notice.localizedDescription)
                        }
                        featuresCard
                        offerSection
                        restoreButton
                        legalLinks
                        if mode == .hard {
                            switchAccountButton
                        }
                    }
                }
                .frame(maxWidth: 560)
                .padding(.horizontal, 16)
                .padding(.bottom, 40)
                .frame(maxWidth: .infinity)
            }
        }
        .interactiveDismissDisabled(mode == .hard)
        .task {
            await loadOffer()
        }
        .alert(
            "Promptomize Premium",
            isPresented: Binding(
                get: { alertMessage != nil },
                set: { if !$0 { alertMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) { alertMessage = nil }
        } message: {
            Text(alertMessage ?? "")
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Spacer()
            Text(showsManagement ? "Subscription" : "Promptomize Premium")
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
            Spacer()
        }
        .overlay(alignment: .trailing) {
            if mode == .manage {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(textSecondary)
                        .frame(width: 32, height: 32)
                        .background {
                            Circle()
                                .fill(Color.adaptiveBackgroundTertiary)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
        }
        .padding(.top, 16)
    }

    // MARK: - Purchase Flow

    private var heroCard: some View {
        VStack(spacing: 14) {
            AppBrandMark(size: 72, showsGlassBackdrop: true)

            Text(mode == .hard ? "Subscribe to start using Promptomize" : "Unlock Promptomize Premium")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
                .multilineTextAlignment(.center)

            Text("Promptomize Premium includes everything in the app: the prompt optimizer and the AI chat assistant.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .liquidGlass(cornerRadius: 24, shadowIntensity: 0.74, borderGlow: true)
    }

    private var featuresCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            featureRow(
                icon: "wand.and.stars",
                title: "Prompt optimizer",
                detail: "Turn rough ideas into precise prompts for text, images, video, music, code and 3D."
            )
            featureRow(
                icon: "bubble.left.and.text.bubble.right.fill",
                title: "AI chat assistant",
                detail: "Ask questions, draft and rewrite, brainstorm, and get help with code."
            )
            featureRow(
                icon: "clock.arrow.circlepath",
                title: "History on all your devices",
                detail: "Chats and results are saved to your account."
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 22, shadowIntensity: 0.68)
    }

    @ViewBuilder
    private var offerSection: some View {
        switch storeKit.productLoadState {
        case .idle, .loading:
            VStack(spacing: 12) {
                ProgressView()
                    .tint(accentColor)
                Text("Loading subscription details…")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(28)
            .liquidGlass(cornerRadius: 22, shadowIntensity: 0.68)

        case .failed:
            productLoadFailedCard

        case .loaded:
            if let product = storeKit.premiumProduct {
                offerCard(for: product)
            } else {
                productLoadFailedCard
            }
        }
    }

    private var productLoadFailedCard: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.icloud")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(warningColor)
            Text("Subscription details couldn't be loaded")
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
                .multilineTextAlignment(.center)
            Text("Check your connection and try again.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await loadOffer() }
            } label: {
                Text("Try Again")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 16))
            .accessibilityIdentifier("paywall.retryProducts")
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .liquidGlass(cornerRadius: 22, shadowIntensity: 0.68)
    }

    private func offerCard(for product: Product) -> some View {
        let offer = SubscriptionOfferTerms(product: product, isEligibleForIntroOffer: isEligibleForIntroOffer)

        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Promptomize Premium")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)
                Text("Auto-renewing subscription · \(offer.periodLength)")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(textSecondary)
            }

            // The billed amount is the most prominent price element.
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(product.displayPrice)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(textPrimary)
                Text("/ \(offer.periodUnit)")
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .foregroundStyle(textSecondary)
            }
            .accessibilityElement(children: .combine)

            if let trialTerms = offer.trialTerms {
                Text(trialTerms)
                    .font(.system(.footnote, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await purchase(product) }
            } label: {
                HStack(spacing: 8) {
                    if storeKit.isPurchasing {
                        ProgressView()
                            .tint(Color.adaptiveTextOnAccent)
                    }
                    Text(offer.callToAction)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .foregroundStyle(Color.adaptiveTextOnAccent)
            }
            .buttonStyle(LiquidGlassButtonStyle(
                cornerRadius: 18,
                tintColor: accentColor,
                intensity: .prominent
            ))
            .disabled(isBusy)
            .accessibilityIdentifier("paywall.subscribe")

            Text(offer.renewalDisclosure)
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(textTertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 22, shadowIntensity: 0.72, borderGlow: true)
    }

    private var restoreButton: some View {
        Button {
            Task { await restore() }
        } label: {
            HStack(spacing: 8) {
                if isRestoring {
                    ProgressView()
                } else {
                    Image(systemName: "arrow.clockwise")
                }
                Text("Restore Purchases")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 18))
        .disabled(isBusy)
        .accessibilityIdentifier("paywall.restore")
    }

    private var legalLinks: some View {
        HStack(spacing: 16) {
            Link("Terms of Use (EULA)", destination: LegalLinks.termsOfUse)
            Link("Privacy Policy", destination: LegalLinks.privacyPolicy)
        }
        .font(.system(.caption, design: .rounded, weight: .semibold))
        .foregroundStyle(textSecondary)
        .frame(maxWidth: .infinity)
    }

    private var switchAccountButton: some View {
        VStack(spacing: 4) {
            if let email = authManager.currentUser?.email {
                Text("Signed in as \(email)")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textTertiary)
            }
            Button {
                Task { await signOut() }
            } label: {
                Text("Sign out or use a different account")
                    .font(.system(.footnote, design: .rounded, weight: .semibold))
                    .underline()
                    .foregroundStyle(textSecondary)
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
            .accessibilityIdentifier("paywall.signOut")

            // An account exists from sign-in onward, so it must be deletable
            // without subscribing (App Review 5.1.1(v)).
            Button(role: .destructive) {
                isConfirmingAccountDeletion = true
            } label: {
                Text("Delete Account")
                    .font(.system(.footnote, design: .rounded, weight: .semibold))
                    .underline()
            }
            .buttonStyle(.plain)
            .foregroundStyle(warningColor)
            .disabled(isBusy)
            .padding(.top, 6)
            .accessibilityIdentifier("paywall.deleteAccount")
        }
        .padding(.top, 4)
        .deleteAccountFlow(isPresented: $isConfirmingAccountDeletion)
    }

    private func noticeBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(warningColor)
            Text(message)
                .font(.system(.footnote, design: .rounded, weight: .medium))
                .foregroundStyle(textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(warningColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func featureRow(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(brandPurple)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)
                Text(detail)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Management

    private var managementCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                AppBrandMark(size: 48, showsGlassBackdrop: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Promptomize Premium")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)
                    Text(storeKit.isTrialing ? "Free trial active" : "Active")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(accentColor)
                }
            }

            if let line = billingDateLine {
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .foregroundStyle(textTertiary)
                    Text(line.label)
                        .foregroundStyle(textSecondary)
                    Text(line.date, style: .date)
                        .foregroundStyle(textPrimary)
                }
                .font(.system(.subheadline, design: .rounded))
            }

            if storeKit.billingProvider == "stripe" {
                Text("This subscription is billed on the web. Manage it at promptomize.app.")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Button {
                    Task { await showManageSubscriptions() }
                } label: {
                    Text("Manage Subscription")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundStyle(Color.adaptiveTextOnAccent)
                }
                .buttonStyle(LiquidGlassButtonStyle(
                    cornerRadius: 16,
                    tintColor: accentColor,
                    intensity: .prominent
                ))
                .accessibilityIdentifier("paywall.manage")

                Text("Change or cancel anytime in Settings > Apple Account > Subscriptions.")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textTertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 22, shadowIntensity: 0.72, borderGlow: true)
    }

    private var billingDateLine: (label: String, date: Date)? {
        guard let info = storeKit.subscriptionInfo else { return nil }
        if info.isTrialing, let trialEnd = info.trialEndsAt ?? info.expiresAt {
            return ("Free trial ends", trialEnd)
        }
        guard let expiresAt = info.expiresAt else { return nil }
        let renews = storeKit.isAutoRenewEnabled ?? (info.status == .active)
        return (renews ? "Renews" : "Access ends", expiresAt)
    }

    // MARK: - Actions

    private func loadOffer() async {
        if storeKit.productLoadState != .loaded {
            await storeKit.loadProducts()
        }
        guard let subscription = storeKit.premiumProduct?.subscription else {
            isEligibleForIntroOffer = false
            return
        }
        isEligibleForIntroOffer = await subscription.isEligibleForIntroOffer
    }

    private func purchase(_ product: Product) async {
        do {
            let result = try await storeKit.purchase(product)
            if case .activated = result, mode == .manage {
                dismiss()
            }
        } catch {
            alertMessage = error.localizedDescription
        }
    }

    private func restore() async {
        isRestoring = true
        defer { isRestoring = false }
        do {
            try await storeKit.restorePurchases()
            // When entitled, hard mode is replaced by RootView and manage
            // mode switches to the subscription status view.
            if !storeKit.isEntitled {
                alertMessage = StoreError.noActivePurchases.localizedDescription
            }
        } catch {
            alertMessage = error.localizedDescription
        }
    }

    private func signOut() async {
        isSigningOut = true
        defer { isSigningOut = false }
        await authManager.signOut()
        historyManager.clearLocalData()
    }

    private func showManageSubscriptions() async {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else { return }
        do {
            try await AppStore.showManageSubscriptions(in: scene)
            await storeKit.refreshEntitlement()
        } catch {
            alertMessage = String(localized: "Subscription settings couldn't be opened. Go to Settings > Apple Account > Subscriptions.")
        }
    }
}

// MARK: - Offer Terms

/// Everything App Review Guideline 3.1.2 requires next to the purchase
/// button, derived from the StoreKit product so price and trial length are
/// never hard-coded.
struct SubscriptionOfferTerms {
    let periodLength: String
    let periodUnit: String
    let callToAction: String
    let trialTerms: String?
    let renewalDisclosure: String

    init(product: Product, isEligibleForIntroOffer: Bool) {
        let price = product.displayPrice
        let period = product.subscription?.subscriptionPeriod
        if let period {
            periodLength = Self.length(of: period)
            periodUnit = Self.unitName(period.unit)
        } else {
            periodLength = String(localized: "1 month")
            periodUnit = String(localized: "month")
        }
        let pricePerPeriod: String
        if let period, period.value != 1 {
            pricePerPeriod = String(localized: "\(price) every \(Self.length(of: period))")
        } else {
            pricePerPeriod = "\(price)/\(periodUnit)"
        }

        if isEligibleForIntroOffer,
           let intro = product.subscription?.introductoryOffer,
           intro.paymentMode == .freeTrial {
            let trialAdjective = Self.adjective(of: intro.period)
            callToAction = String(localized: "Start \(trialAdjective.capitalized) Free Trial")
            trialTerms = String(localized: "\(trialAdjective) free trial, then \(pricePerPeriod). Cancel at least 24 hours before the trial ends to avoid being charged.")
            renewalDisclosure = String(localized: "Payment is charged to your Apple Account when the free trial ends, unless you cancel at least 24 hours before. The subscription then renews automatically at \(pricePerPeriod) unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in Settings > Apple Account > Subscriptions.")
        } else {
            callToAction = String(localized: "Subscribe for \(pricePerPeriod)")
            trialTerms = nil
            renewalDisclosure = String(localized: "Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically at \(pricePerPeriod) unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in Settings > Apple Account > Subscriptions.")
        }
    }

    /// "1 month", "3 days".
    private static func length(of period: Product.SubscriptionPeriod) -> String {
        let unit = unitName(period.unit)
        return period.value == 1 ? "1 \(unit)" : "\(period.value) \(unit)s"
    }

    /// "3-day", "1-week".
    private static func adjective(of period: Product.SubscriptionPeriod) -> String {
        "\(period.value)-\(unitName(period.unit))"
    }

    private static func unitName(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return String(localized: "day")
        case .week: return String(localized: "week")
        case .month: return String(localized: "month")
        case .year: return String(localized: "year")
        @unknown default: return String(localized: "period")
        }
    }
}

#Preview {
    PaywallView(mode: .hard)
        .environment(AuthManager.shared)
        .environment(StoreKitManager.shared)
        .environment(PromptHistoryManager.shared)
}
