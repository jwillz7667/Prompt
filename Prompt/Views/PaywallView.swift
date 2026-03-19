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
    @Environment(StoreKitManager.self) private var storeKit

    @State private var selectedProduct: Product?
    @State private var isProcessing = false
    @State private var showError = false
    @State private var errorMessage = ""
    @State private var showSuccess = false
    @State private var trialEligible = false

    // Brand colors
    private var accentColor: Color { Color.brandCyan }
    private var brandPurple: Color { Color.brandPurple }

    private var theme: AppTheme {
        colorScheme == .dark ? .dark : .light
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 24) {
                    PromptPageHeader(
                        title: "Premium",
                        subtitle: "Unlock stronger prompts, more usage, and advanced tools",
                        onLeadingTap: { dismiss() }
                    )
                    .padding(.top, 12)

                    // Trial banner (if eligible)
                    if trialEligible && storeKit.currentTier == .free {
                        trialBanner
                    }

                    // Tier comparison
                    tierComparisonSection

                    // Product options
                    productSelectionSection

                    // Purchase button
                    purchaseButton

                    // Restore purchases
                    restoreButton

                    // Legal links
                    legalSection
                }
                    .padding(.horizontal, 20)
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
                Text("Your subscription is now active. Enjoy your premium features!")
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Crown icon with glass effect
            ZStack {
                // Glass background
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 88, height: 88)

                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.yellow.opacity(0.2),
                                Color.orange.opacity(0.15)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 88, height: 88)

                // Highlight
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.white.opacity(colorScheme == .dark ? 0.15 : 0.6), Color.clear],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 88, height: 88)
                    .opacity(0.5)

                Image(systemName: "crown.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.yellow, .orange],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .overlay {
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color.yellow.opacity(0.5), Color.orange.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1.5
                    )
                    .frame(width: 88, height: 88)
            }
            .shadow(color: Color.yellow.opacity(0.3), radius: 12, y: 0)
            .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.15), radius: 10, y: 5)
            .padding(.top, 20)

            Text("Unlock Premium Prompts")
                .font(.title.bold())
                .foregroundStyle(Color.adaptiveTextPrimary)
                .multilineTextAlignment(.center)

            Text("Get access to advanced prompt engineering techniques that deliver better AI results")
                .font(.body)
                .foregroundStyle(Color.adaptiveTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
    }

    // MARK: - Trial Banner

    private var trialBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "gift.fill")
                .font(.title2)
                .foregroundStyle(accentColor)

            VStack(alignment: .leading, spacing: 2) {
                Text("Try Premium Free for 7 Days")
                    .font(.headline)
                    .foregroundStyle(Color.adaptiveTextPrimary)

                Text("Cancel anytime during trial")
                    .font(.caption)
                    .foregroundStyle(Color.adaptiveTextSecondary)
            }

            Spacer()

            Button {
                Task {
                    await startTrial()
                }
            } label: {
                Text("Start")
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
            }
            .buttonStyle(GlassCapsuleButtonStyle(tintColor: brandPurple, intensity: .prominent))
        }
        .padding()
        .liquidGlass(cornerRadius: 16, shadowIntensity: 0.8, borderGlow: false)
    }

    // MARK: - Tier Comparison

    private var tierComparisonSection: some View {
        VStack(spacing: 12) {
            Text("Compare Plans")
                .font(.headline)
                .foregroundStyle(Color.adaptiveTextPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 0) {
                // Header row
                HStack {
                    Text("Feature")
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity, alignment: .leading)

                    ForEach([SubscriptionTier.free, .pro, .premium], id: \.self) { tier in
                        Text(tier.displayName)
                            .font(.subheadline.bold())
                            .frame(width: 60)
                    }
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
                .background(Color.adaptiveBackgroundTertiary.opacity(0.8))

                LiquidGlassDivider()

                // Feature rows
                featureRow("Daily Prompts", free: "10", pro: "100", premium: "Unlimited")
                featureRow("Prompt Quality", free: "Basic", pro: "Standard", premium: "Advanced")
                featureRow("Export Prompts", free: false, pro: true, premium: true)
            }
            .liquidGlass(cornerRadius: 12, shadowIntensity: 0.6, borderGlow: false)
        }
    }

    private func featureRow(_ name: String, free: String, pro: String, premium: String) -> some View {
        HStack {
            Text(name)
                .font(.subheadline)
                .foregroundStyle(Color.adaptiveTextPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(free)
                .font(.caption)
                .foregroundStyle(Color.adaptiveTextSecondary)
                .frame(width: 60)

            Text(pro)
                .font(.caption)
                .foregroundStyle(Color.adaptiveTextPrimary)
                .frame(width: 60)

            Text(premium)
                .font(.caption.bold())
                .foregroundStyle(accentColor)
                .frame(width: 60)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
    }

    private func featureRow(_ name: String, free: Bool, pro: Bool, premium: Bool) -> some View {
        HStack {
            Text(name)
                .font(.subheadline)
                .foregroundStyle(Color.adaptiveTextPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            checkmark(free)
                .frame(width: 60)

            checkmark(pro)
                .frame(width: 60)

            checkmark(premium)
                .frame(width: 60)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
    }

    private func checkmark(_ enabled: Bool) -> some View {
        Image(systemName: enabled ? "checkmark.circle.fill" : "xmark.circle")
            .foregroundStyle(enabled ? (colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)) : Color.adaptiveTextTertiary)
            .font(.subheadline)
    }

    // MARK: - Product Selection

    private var productSelectionSection: some View {
        VStack(spacing: 12) {
            Text("Choose Your Plan")
                .font(.headline)
                .foregroundStyle(Color.adaptiveTextPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            if storeKit.isLoading && storeKit.products.isEmpty {
                ProgressView()
                    .padding()
            } else if storeKit.products.isEmpty {
                Text("Unable to load products. Please try again later.")
                    .font(.subheadline)
                    .foregroundStyle(Color.adaptiveTextSecondary)
                    .padding()
            } else {
                // Group products by tier
                VStack(spacing: 12) {
                    // Pro products
                    if !storeKit.proProducts.isEmpty {
                        tierProductGroup(tier: .pro, products: storeKit.proProducts)
                    }

                    // Premium products
                    if !storeKit.premiumProducts.isEmpty {
                        tierProductGroup(tier: .premium, products: storeKit.premiumProducts)
                    }
                }
            }
        }
    }

    private func tierProductGroup(tier: SubscriptionTier, products: [Product]) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text(tier.displayName)
                    .font(.subheadline.bold())
                    .foregroundStyle(tier == .premium ? brandPurple : Color.adaptiveTextPrimary)

                if tier == .premium {
                    Text("BEST VALUE")
                        .font(.caption2.bold())
                        .foregroundStyle(Color.adaptiveTextOnAccent)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(brandPurple)
                        .clipShape(Capsule())
                }

                Spacer()
            }
            .padding(.horizontal, 4)

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
                            .font(.headline)
                            .foregroundStyle(Color.adaptiveTextPrimary)

                        if isAnnual {
                            Text("Save 17%")
                                .font(.caption.bold())
                                .foregroundStyle(Color.adaptiveTextOnAccent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4))
                                .clipShape(Capsule())
                        }
                    }

                    if isAnnual, let monthlyEquiv = storeKit.monthlyEquivalent(for: product) {
                        Text("\(monthlyEquiv)/month")
                            .font(.caption)
                            .foregroundStyle(Color.adaptiveTextSecondary)
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(product.displayPrice)
                        .font(.title3.bold())
                        .foregroundStyle(Color.adaptiveTextPrimary)

                    Text(isAnnual ? "/year" : "/month")
                        .font(.caption)
                        .foregroundStyle(Color.adaptiveTextSecondary)
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
            cornerRadius: 12,
            tintColor: isSelected ? selectionColor : nil,
            intensity: isSelected ? .standard : .subtle
        ))
    }

    // MARK: - Purchase Button

    private var purchaseButton: some View {
        Button {
            Task {
                await purchase()
            }
        } label: {
            HStack {
                if isProcessing {
                    ProgressView()
                        .tint(Color.adaptiveTextOnAccent)
                } else {
                    Text(selectedProduct != nil ? "Subscribe Now" : "Select a Plan")
                        .font(.headline)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .foregroundStyle(selectedProduct != nil
                ? Color.adaptiveTextOnAccent
                : Color.adaptiveTextTertiary)
        }
        .buttonStyle(LiquidGlassButtonStyle(
            cornerRadius: 14,
            tintColor: selectedProduct != nil ? Color.adaptiveButtonPrimary : nil,
            intensity: selectedProduct != nil ? .prominent : .subtle
        ))
        .disabled(selectedProduct == nil || isProcessing)
    }

    // MARK: - Restore Button

    private var restoreButton: some View {
        Button {
            Task {
                await restorePurchases()
            }
        } label: {
            Text("Restore Purchases")
                .font(.subheadline)
                .foregroundStyle(Color.adaptiveTextSecondary)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
        }
        .buttonStyle(GlassSecondaryButtonStyle(cornerRadius: 20))
        .disabled(isProcessing)
    }

    // MARK: - Legal Section

    private var legalSection: some View {
        VStack(spacing: 8) {
            Text("Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period.")
                .font(.caption2)
                .foregroundStyle(Color.adaptiveTextTertiary)
                .multilineTextAlignment(.center)

            HStack(spacing: 16) {
                Link("Terms of Service", destination: URL(string: "https://promptomizer.app/terms")!)
                    .font(.caption)
                    .foregroundStyle(Color.adaptiveTextSecondary)

                Link("Privacy Policy", destination: URL(string: "https://promptomizer.app/privacy")!)
                    .font(.caption)
                    .foregroundStyle(Color.adaptiveTextSecondary)
            }
        }
        .padding(.top)
    }

    // MARK: - Actions

    private func loadData() async {
        await storeKit.loadProducts()
        trialEligible = await storeKit.checkTrialEligibility()

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
                showSuccess = true
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func startTrial() async {
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
                showSuccess = true
            } else {
                errorMessage = "No active subscriptions found"
                showError = true
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}

#Preview {
    PaywallView()
        .environment(StoreKitManager.shared)
}
