//
//  PaywallView.swift
//  Prompt
//
//  Brand Colors: Purple (#512AD4) and Cyan (#00FFF9)
//

import SwiftUI
import StoreKit

struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager
    @Environment(StoreKitManager.self) private var storeKit

    @State private var selectedProduct: Product?
    @State private var isProcessing = false
    @State private var showError = false
    @State private var errorMessage = ""
    @State private var showSuccess = false
    @State private var showAuthGate = false
    @State private var showSignInSuggestion = false
    @State private var trialEligible = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { Color.adaptiveButtonPrimary }
    private var brandPurple: Color { colorScheme == .dark ? Color.brandPurple : Color.brandPurpleDark }
    private var successColor: Color {
        colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)
    }
    private var warningColor: Color {
        colorScheme == .dark ? Color(red: 255/255, green: 159/255, blue: 10/255) : Color(red: 0.9, green: 0.6, blue: 0.1)
    }
    private var currentPlanTitle: String {
        switch storeKit.currentTier {
        case .free:
            return "Unlock the full experience"
        case .pro:
            return "Upgrade from Pro to Premium"
        case .premium:
            return "Premium is active"
        }
    }
    private var currentPlanSubtitle: String {
        switch storeKit.currentTier {
        case .free:
            return "Unlock all modalities, MAX mode, advanced prompt quality, and unlimited daily usage."
        case .pro:
            return "Move into unlimited usage, MAX mode, and the strongest prompt engineering available."
        case .premium:
            return "This account has the full experience unlocked across all modalities."
        }
    }
    private var headerTitle: String {
        storeKit.currentTier == .premium ? "Premium" : "Unlock Premium"
    }
    private var headerSubtitle: String {
        switch storeKit.currentTier {
        case .free:
            return "Choose a plan and unlock every modality, MAX mode, and stronger prompts."
        case .pro:
            return "Step up from Pro and unlock unlimited usage, MAX mode, and the strongest prompts."
        case .premium:
            return "Your account has the strongest prompt workflow unlocked."
        }
    }
    private var selectedProductIsCurrent: Bool {
        guard let selectedProduct else { return false }
        return storeKit.purchasedProductIDs.contains(selectedProduct.id)
    }

    private var requiresAuthentication: Bool {
        !authManager.isAuthenticated
    }

    private var primaryActionTitle: String {
        if selectedProductIsCurrent {
            return "Current plan active"
        }

        guard let selectedProduct, let productId = ProductID(rawValue: selectedProduct.id) else {
            return "Choose a Plan"
        }

        return "Unlock \(productId.tier.displayName)"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 18) {
                        // Clean header matching chat UI theme
                        HStack {
                            Spacer()

                            Text(headerTitle)
                                .font(.system(.headline, design: .rounded, weight: .bold))
                                .foregroundStyle(textPrimary)

                            Spacer()
                        }
                        .overlay(alignment: .trailing) {
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
                        }
                        .padding(.top, 16)

                        heroCard

                        if trialEligible && storeKit.currentTier == .free {
                            trialBanner
                        }

                        tierComparisonSection
                        productSelectionSection
                        actionSection
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 40)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await loadData()
            }
            .alert("Error", isPresented: $showError) {
                Button("Try Again") {
                    Task {
                        await loadData()
                    }
                }
                Button("OK", role: .cancel) {
                    errorMessage = ""
                }
            } message: {
                Text(errorMessage)
            }
            .alert("Success", isPresented: $showSuccess) {
                Button("Great!") {
                    dismiss()
                }
            } message: {
                Text("Premium is now unlocked on this account.")
            }
            .alert("Purchase Successful", isPresented: $showSignInSuggestion) {
                Button("Sign In Now") {
                    showAuthGate = true
                }
                Button("Later", role: .cancel) {
                    dismiss()
                }
            } message: {
                Text("Your subscription is active on this device. Sign in to sync your purchase across all your devices.")
            }
            .fullScreenCover(isPresented: $showAuthGate) {
                AuthView(mode: .standard) {
                    Task {
                        await loadData()
                    }
                }
            }
        }
    }

    // MARK: - Hero

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 14) {
                AppBrandMark(size: 58, showsGlassBackdrop: true)

                VStack(alignment: .leading, spacing: 4) {
                    Text(currentPlanTitle)
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)

                    Text(currentPlanSubtitle)
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 8) {
                benefitChip(
                    title: storeKit.currentTier == .free ? "MAX Mode" : "\(storeKit.currentTier.displayName) Active",
                    systemImage: storeKit.currentTier == .free ? "flame.fill" : "checkmark.seal.fill",
                    tint: storeKit.currentTier == .free ? warningColor : successColor
                )

                benefitChip(
                    title: "All modalities",
                    systemImage: "slider.horizontal.3",
                    tint: brandPurple
                )

                benefitChip(
                    title: "Advanced AI",
                    systemImage: "wand.and.stars",
                    tint: accentColor
                )
            }

            if let usage = storeKit.usageInfo, !usage.isUnlimited {
                HStack(spacing: 10) {
                    UsageIndicator(used: usage.dailyPromptsUsed, limit: usage.dailyPromptsLimit)
                    Text("\(usage.remainingPrompts) prompts left today")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(textSecondary)
                    Spacer()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 24, shadowIntensity: 0.74, borderGlow: true)
    }

    // MARK: - Trial Banner

    private var trialBanner: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "gift.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(warningColor)

                Text("Start a 7-day Premium trial")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)

                Spacer()
            }

            Text("Get 7 days of full Premium access, free. No payment is required and nothing is charged — your trial simply ends automatically after 7 days.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Task {
                    await startTrial()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                    Text("Start Free Trial")
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .buttonStyle(LiquidGlassButtonStyle(cornerRadius: 16, tintColor: brandPurple, intensity: .prominent))
        }
        .padding(18)
        .liquidGlass(cornerRadius: 22, shadowIntensity: 0.7, borderGlow: true)
    }

    private var signInSuggestionCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.badge.key.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(accentColor)

            Text("Sign in to sync purchases across devices and unlock the free trial.")
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()

            Button {
                showAuthGate = true
            } label: {
                Text("Sign In")
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)
            }
            .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 12))
        }
    }

    // MARK: - Tier Comparison

    private var tierComparisonSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            LiquidGlassSectionHeader(title: "Why upgrade", icon: "chart.line.uptrend.xyaxis")

            VStack(spacing: 0) {
                comparisonRow(
                    title: "All modalities",
                    subtitle: "Image, video, audio, code, and 3D prompt generation",
                    value: "Pro & Premium",
                    icon: "slider.horizontal.3",
                    tint: brandPurple
                )
                LiquidGlassDivider()
                comparisonRow(
                    title: "MAX mode",
                    subtitle: "Deeper reasoning for complex, multi-step prompts",
                    value: "Pro & Premium",
                    icon: "flame.fill",
                    tint: warningColor
                )
                LiquidGlassDivider()
                comparisonRow(
                    title: "Prompt quality",
                    subtitle: "From basic cleanup to cutting-edge prompt engineering",
                    value: "Basic → Advanced",
                    icon: "wand.and.stars",
                    tint: accentColor
                )
                LiquidGlassDivider()
                comparisonRow(
                    title: "Daily usage",
                    subtitle: "More prompts for active building sessions",
                    value: "10 → Unlimited",
                    icon: "arrow.up.right",
                    tint: successColor
                )
            }
            .liquidGlass(cornerRadius: 22, shadowIntensity: 0.68)
        }
    }

    private func comparisonRow(title: String, subtitle: String, value: String, icon: String = "", tint: Color) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 36, height: 36)
                Circle()
                    .stroke(tint.opacity(0.35), lineWidth: 1)
                    .frame(width: 36, height: 36)

                if icon.isEmpty {
                    Circle()
                        .fill(tint)
                        .frame(width: 10, height: 10)
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(tint)
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)
                Text(subtitle)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()

            Text(value)
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .liquidGlassChip(isSelected: false, accentColor: tint)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Product Selection

    private var productSelectionSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            LiquidGlassSectionHeader(title: "Choose a plan", icon: "crown.fill")

            VStack(alignment: .leading, spacing: 14) {
                if storeKit.isLoading && storeKit.products.isEmpty {
                    HStack {
                        Spacer()
                        ProgressView()
                            .padding(.vertical, 12)
                        Spacer()
                    }
                } else if storeKit.products.isEmpty {
                    fallbackPlansSection
                } else {
                    if !storeKit.proProducts.isEmpty {
                        tierProductGroup(tier: .pro, products: storeKit.proProducts)
                    }

                    if !storeKit.premiumProducts.isEmpty {
                        tierProductGroup(tier: .premium, products: storeKit.premiumProducts)
                    }
                }
            }
            .padding(18)
            .liquidGlass(cornerRadius: 22, shadowIntensity: 0.72, borderGlow: true)
        }
    }

    private var fallbackPlansSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("App Store products are temporarily unavailable. These cards show what each tier unlocks while pricing reloads.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            fallbackPlanCard(
                tier: .pro,
                highlight: "All modalities + MAX",
                details: "100 daily prompts, all modalities (image, video, audio, code, 3D), MAX mode, and standard-quality prompt engineering."
            )

            fallbackPlanCard(
                tier: .premium,
                highlight: "Unlimited + Advanced",
                details: "Unlimited prompts, all modalities, MAX mode, and the most advanced prompt engineering with cutting-edge techniques."
            )
        }
    }

    private func fallbackPlanCard(tier: SubscriptionTier, highlight: String, details: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(tier.displayName)
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(tier == .premium ? brandPurple : textPrimary)

                Spacer()

                Text(highlight)
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .liquidGlassChip(
                        isSelected: false,
                        accentColor: tier == .premium ? brandPurple : accentColor
                    )
            }

            Text(details)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .liquidGlass(cornerRadius: 18, shadowIntensity: 0.48)
    }

    private func tierProductGroup(tier: SubscriptionTier, products: [Product]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(tier.displayName)
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(tier == .premium ? brandPurple : textPrimary)

                if tier == .premium {
                    Text("Recommended")
                        .font(.system(.caption2, design: .rounded, weight: .bold))
                        .foregroundStyle(Color.adaptiveTextOnAccent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule().fill(
                                LinearGradient(
                                    colors: [brandPurple, accentColor],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                        )
                }

                Spacer()
            }

            ForEach(products, id: \.id) { product in
                productCard(product, tier: tier)
            }
        }
    }

    private func productCard(_ product: Product, tier: SubscriptionTier) -> some View {
        let isSelected = selectedProduct?.id == product.id
        let productId = ProductID(rawValue: product.id)
        let isAnnual = productId?.isAnnual ?? false
        let selectionColor = tier == .premium ? brandPurple : accentColor

        return Button {
            selectedProduct = product
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                            Text(isAnnual ? "Annual" : "Monthly")
                            .font(.system(.headline, design: .rounded, weight: .bold))
                            .foregroundStyle(textPrimary)

                        if isAnnual {
                            Text("Save 17%")
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                                .foregroundStyle(Color.adaptiveTextOnAccent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(successColor)
                                .clipShape(Capsule())
                        }
                    }

                    if isAnnual, let monthlyEquiv = storeKit.monthlyEquivalent(for: product) {
                        Text("\(monthlyEquiv)/month")
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(textSecondary)
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(product.displayPrice)
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(textPrimary)

                    Text(isAnnual ? "/year" : "/month")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(textSecondary)
                    }

                // Selection indicator with glass effect
                ZStack {
                    Circle()
                        .fill(.ultraThinMaterial)
                        .frame(width: 28, height: 28)

                    Circle()
                        .stroke(
                            LinearGradient(
                                colors: isSelected
                                    ? [selectionColor.opacity(0.8), selectionColor.opacity(0.4)]
                                    : [Color.adaptiveBorder.opacity(0.8), Color.adaptiveBorder.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 2
                        )
                        .frame(width: 28, height: 28)

                    if isSelected {
                        Circle()
                            .fill(
                                RadialGradient(
                                    colors: [selectionColor, selectionColor.opacity(0.8)],
                                    center: .center,
                                    startRadius: 0,
                                    endRadius: 10
                                )
                            )
                            .frame(width: 16, height: 16)
                            .shadow(color: selectionColor.opacity(0.5), radius: 4)
                    }
                }
                .padding(.leading, 8)
            }
            .padding()
        }
        .buttonStyle(LiquidGlassButtonStyle(
            cornerRadius: 18,
            tintColor: isSelected ? selectionColor : nil,
            intensity: isSelected ? .standard : .subtle
        ))
        .animation(.spring(response: 0.28, dampingFraction: 0.82), value: isSelected)
    }

    // MARK: - Action Section

    private var actionSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            LiquidGlassSectionHeader(title: "Unlock Premium", icon: "creditcard.fill")

            VStack(alignment: .leading, spacing: 14) {
                if let selectedProduct {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Selected")
                                .font(.system(.caption, design: .rounded, weight: .medium))
                                .foregroundStyle(textTertiary)
                            Text(productSummary(for: selectedProduct))
                                .font(.system(.subheadline, design: .rounded, weight: .bold))
                                .foregroundStyle(textPrimary)
                        }

                        Spacer()

                        if selectedProductIsCurrent {
                            Text("Current")
                                .font(.system(.caption, design: .rounded, weight: .bold))
                                .foregroundStyle(textPrimary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .liquidGlassChip(isSelected: false, accentColor: successColor)
                        }
                    }
                }

                purchaseButton

                restoreButton

                if requiresAuthentication {
                    signInSuggestionCard
                }

                legalSection
            }
            .padding(18)
            .liquidGlass(cornerRadius: 22, shadowIntensity: 0.72)
        }
    }

    private var purchaseButton: some View {
        Button {
            Task {
                await purchase()
            }
        } label: {
            HStack(spacing: 8) {
                if isProcessing {
                    ProgressView()
                        .tint(Color.adaptiveTextOnAccent)
                } else {
                    Image(systemName: selectedProductIsCurrent ? "checkmark.seal.fill" : "crown.fill")
                        .font(.system(size: 14, weight: .bold))
                    Text(primaryActionTitle)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .foregroundStyle(selectedProduct != nil ? Color.adaptiveTextOnAccent : textTertiary)
        }
        .buttonStyle(LiquidGlassButtonStyle(
            cornerRadius: 18,
            tintColor: selectedProduct != nil ? accentColor : nil,
            intensity: selectedProduct != nil ? .prominent : .subtle
        ))
        .disabled(selectedProduct == nil || isProcessing || selectedProductIsCurrent)
    }

    private var restoreButton: some View {
        Button {
            Task {
                await restorePurchases()
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.clockwise")
                Text("Restore Purchase")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 18))
        .disabled(isProcessing)
    }

    private var legalSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period. Renewal is charged within 24 hours of the next billing date.")
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(textTertiary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 16) {
                Link("Terms of Service", destination: URL(string: "https://promptomize.app/terms")!)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(textSecondary)

                Link("Privacy Policy", destination: URL(string: "https://promptomize.app/privacy")!)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(textSecondary)
            }
        }
    }

    // MARK: - Actions

    private func loadData() async {
        await storeKit.loadProducts()
        if authManager.isAuthenticated {
            trialEligible = await storeKit.checkTrialEligibility()
        } else {
            trialEligible = false
        }

        // Auto-select premium monthly
        if let premiumMonthly = storeKit.products.first(where: { $0.id == ProductID.premiumMonthly.rawValue }) {
            selectedProduct = premiumMonthly
        } else if let firstProduct = storeKit.products.first {
            selectedProduct = firstProduct
        }
    }

    private func purchase() async {
        guard let product = selectedProduct else { return }

        isProcessing = true
        defer { isProcessing = false }

        do {
            if let _ = try await storeKit.purchase(product) {
                if authManager.isAuthenticated {
                    showSuccess = true
                } else {
                    showSignInSuggestion = true
                }
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func startTrial() async {
        guard authManager.isAuthenticated else {
            // Trial is account-based — sign-in is required to activate it
            showAuthGate = true
            return
        }

        isProcessing = true
        defer { isProcessing = false }

        do {
            try await storeKit.startFreeTrial()
            showSuccess = true
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func restorePurchases() async {
        isProcessing = true
        defer { isProcessing = false }

        do {
            try await storeKit.restorePurchases()
            if storeKit.hasActiveSubscription {
                if authManager.isAuthenticated {
                    showSuccess = true
                } else {
                    showSignInSuggestion = true
                }
            } else {
                errorMessage = "No active subscriptions found"
                showError = true
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func benefitChip(title: String, systemImage: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 11, weight: .semibold))
            Text(title)
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(textPrimary)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .liquidGlassChip(isSelected: false, accentColor: tint)
    }

    private func productSummary(for product: Product) -> String {
        let isAnnual = ProductID(rawValue: product.id)?.isAnnual ?? false
        return "\(product.displayPrice) • \(isAnnual ? "Annual" : "Monthly")"
    }

}

#Preview {
    PaywallView()
        .environment(AuthManager.shared)
        .environment(StoreKitManager.shared)
}
