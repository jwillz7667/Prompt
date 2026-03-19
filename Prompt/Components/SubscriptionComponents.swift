import SwiftUI

// MARK: - Semantic Status Colors

private extension Color {
    static func semanticSuccess(_ colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)
    }
    static func semanticError(_ colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25)
    }
    static func semanticWarning(_ colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color(red: 255/255, green: 159/255, blue: 10/255) : Color(red: 0.9, green: 0.6, blue: 0.1)
    }
    static func tierPro(_ colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color.brandCyan : Color.brandPurple
    }
    static func tierPremium(_ colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color.brandCyan : Color.brandPurpleDark
    }
}

// MARK: - Usage Indicator

struct UsageIndicator: View {
    @Environment(\.colorScheme) private var colorScheme
    let used: Int
    let limit: Int

    private var isUnlimited: Bool {
        limit == -1
    }

    private var remaining: Int {
        if isUnlimited { return Int.max }
        return max(0, limit - used)
    }

    private var progress: Double {
        if isUnlimited { return 0 }
        guard limit > 0 else { return 1 }
        return min(1, Double(used) / Double(limit))
    }

    private var statusColor: Color {
        if isUnlimited { return .semanticSuccess(colorScheme) }
        if progress >= 0.9 { return .semanticError(colorScheme) }
        if progress >= 0.7 { return .semanticWarning(colorScheme) }
        return .semanticSuccess(colorScheme)
    }

    var body: some View {
        HStack(spacing: 6) {
            // Progress ring or infinity
            ZStack {
                Circle()
                    .stroke(Color.adaptiveBackgroundTertiary, lineWidth: 2.5)
                    .frame(width: 26, height: 26)

                if !isUnlimited {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(statusColor, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .frame(width: 26, height: 26)
                        .rotationEffect(.degrees(-90))
                } else {
                    Image(systemName: "infinity")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(statusColor)
                }
            }

            // Text label
            if isUnlimited {
                // Show nothing for unlimited - the infinity symbol is enough
            } else {
                Text("\(remaining)")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(statusColor)
            }
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Subscription Badge

struct SubscriptionBadge: View {
    @Environment(\.colorScheme) private var colorScheme
    let tier: SubscriptionTier

    var body: some View {
        HStack(spacing: 4) {
            if tier == .premium {
                Image(systemName: "crown.fill")
                    .font(.caption2)
            } else if tier == .pro {
                Image(systemName: "star.fill")
                    .font(.caption2)
            }

            Text(tier.displayName)
                .font(.caption.bold())
        }
        .foregroundStyle(badgeTextColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(badgeBackgroundColor)
        .clipShape(Capsule())
    }

    private var badgeBackgroundColor: Color {
        switch tier {
        case .free:
            return Color.adaptiveBackgroundTertiary
        case .pro:
            return Color.tierPro(colorScheme).opacity(0.15)
        case .premium:
            return Color.tierPremium(colorScheme).opacity(0.15)
        }
    }

    private var badgeTextColor: Color {
        switch tier {
        case .free:
            return Color.adaptiveTextSecondary
        case .pro:
            return .tierPro(colorScheme)
        case .premium:
            return .tierPremium(colorScheme)
        }
    }
}

// MARK: - Upgrade Prompt Card

struct UpgradePromptCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let currentTier: SubscriptionTier
    let onUpgrade: () -> Void

    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(upgradeTitle)
                        .font(.headline)
                        .foregroundStyle(Color.adaptiveTextPrimary)

                    Text(upgradeSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(Color.adaptiveTextSecondary)
                }

                Spacer()

                Image(systemName: actionSystemImage)
                    .font(.title)
                    .foregroundStyle(accentColor)
            }

            Button(action: onUpgrade) {
                HStack(spacing: 8) {
                    Image(systemName: actionSystemImage)
                        .font(.system(size: 13, weight: .semibold))
                    Text(actionTitle)
                        .font(.subheadline.bold())
                }
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(GlassPrimaryButtonStyle(cornerRadius: 10))
        }
        .padding()
        .liquidGlass(cornerRadius: 16, shadowIntensity: 0.6)
    }

    private var upgradeTitle: String {
        switch currentTier {
        case .free:
            return "Upgrade to Premium"
        case .pro:
            return "Upgrade to Premium"
        case .premium:
            return "Manage Premium"
        }
    }

    private var upgradeSubtitle: String {
        switch currentTier {
        case .free:
            return "Unlock MAX mode, more daily usage, and advanced power tools"
        case .pro:
            return "Unlock unlimited prompts and advanced features"
        case .premium:
            return "Review billing, renewal, and App Store subscription settings"
        }
    }

    private var actionTitle: String {
        switch currentTier {
        case .free:
            return "See Premium Plans"
        case .pro:
            return "Upgrade to Premium"
        case .premium:
            return "Manage Subscription"
        }
    }

    private var actionSystemImage: String {
        switch currentTier {
        case .free, .pro:
            return "crown.fill"
        case .premium:
            return "slider.horizontal.3"
        }
    }
}

// MARK: - Feature Lock Overlay

struct FeatureLockOverlay: View {
    @Environment(\.colorScheme) private var colorScheme
    let featureName: String
    let requiredTier: SubscriptionTier
    let onUnlock: () -> Void

    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.title)
                .foregroundStyle(Color.adaptiveTextTertiary)

            Text("\(featureName) requires \(requiredTier.displayName)")
                .font(.subheadline)
                .foregroundStyle(Color.adaptiveTextSecondary)
                .multilineTextAlignment(.center)

            Button(action: onUnlock) {
                Text("Upgrade")
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
            }
            .buttonStyle(GlassCapsuleButtonStyle(tintColor: accentColor))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.adaptiveBackgroundPrimary.opacity(0.9))
    }
}

// MARK: - Subscription Status Card

struct SubscriptionStatusCard: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(StoreKitManager.self) private var storeKit

    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Current Plan")
                        .font(.subheadline)
                        .foregroundStyle(Color.adaptiveTextSecondary)

                    HStack(spacing: 8) {
                        Text(storeKit.currentTier.displayName)
                            .font(.title2.bold())
                            .foregroundStyle(Color.adaptiveTextPrimary)

                        if storeKit.isTrialing {
                            Text("TRIAL")
                                .font(.caption2.bold())
                                .foregroundStyle(Color.adaptiveTextOnAccent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.semanticWarning(colorScheme))
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                SubscriptionBadge(tier: storeKit.currentTier)
            }

            // Usage bar (for non-premium)
            if let usage = storeKit.usageInfo, !usage.isUnlimited {
                VStack(spacing: 8) {
                    HStack {
                        Text("Daily Prompts")
                            .font(.caption)
                            .foregroundStyle(Color.adaptiveTextSecondary)

                        Spacer()

                        Text("\(usage.dailyPromptsUsed)/\(usage.dailyPromptsLimit)")
                            .font(.caption.bold())
                            .foregroundStyle(Color.adaptiveTextPrimary)
                    }

                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.adaptiveBackgroundTertiary)

                            RoundedRectangle(cornerRadius: 4)
                                .fill(usageBarColor(usage.usagePercentage))
                                .frame(width: geometry.size.width * CGFloat(min(1, usage.usagePercentage)))
                        }
                    }
                    .frame(height: 8)
                }
            }

            // Renewal date
            if let subscription = storeKit.subscriptionInfo,
               let expiresAt = subscription.expiresAt,
               subscription.isActive {
                HStack {
                    Image(systemName: "calendar")
                        .font(.caption)
                        .foregroundStyle(Color.adaptiveTextTertiary)

                    Text(storeKit.isTrialing ? "Trial ends" : "Renews")
                        .font(.caption)
                        .foregroundStyle(Color.adaptiveTextTertiary)

                    Text(expiresAt, style: .date)
                        .font(.caption)
                        .foregroundStyle(Color.adaptiveTextSecondary)
                }
            }
        }
        .padding()
        .liquidGlass(cornerRadius: 16, shadowIntensity: 0.6)
    }

    private func usageBarColor(_ percentage: Double) -> Color {
        if percentage >= 0.9 { return .semanticError(colorScheme) }
        if percentage >= 0.7 { return .semanticWarning(colorScheme) }
        return .semanticSuccess(colorScheme)
    }
}

// MARK: - Quota Exceeded Banner

struct QuotaExceededBanner: View {
    @Environment(\.colorScheme) private var colorScheme
    let onUpgrade: () -> Void

    private var warningColor: Color { .semanticWarning(colorScheme) }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title2)
                .foregroundStyle(warningColor)

            VStack(alignment: .leading, spacing: 2) {
                Text("Daily Limit Reached")
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.adaptiveTextPrimary)

                Text("Upgrade for more prompts")
                    .font(.caption)
                    .foregroundStyle(Color.adaptiveTextSecondary)
            }

            Spacer()

            Button(action: onUpgrade) {
                Text("Upgrade")
                    .font(.caption.bold())
                    .foregroundStyle(Color.adaptiveTextOnAccent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
            }
            .buttonStyle(GlassCapsuleButtonStyle(tintColor: warningColor))
        }
        .padding()
        .background(warningColor.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(warningColor.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Trial Banner

struct TrialBanner: View {
    @Environment(\.colorScheme) private var colorScheme
    let daysRemaining: Int
    let onManage: () -> Void

    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "gift.fill")
                .font(.title2)
                .foregroundStyle(accentColor)

            VStack(alignment: .leading, spacing: 2) {
                Text("Premium Trial")
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.adaptiveTextPrimary)

                Text("\(daysRemaining) day\(daysRemaining == 1 ? "" : "s") remaining")
                    .font(.caption)
                    .foregroundStyle(Color.adaptiveTextSecondary)
            }

            Spacer()

            Button(action: onManage) {
                Text("Manage")
                    .font(.caption.bold())
                    .foregroundStyle(accentColor)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(accentColor.opacity(0.15))
                    .clipShape(Capsule())
            }
        }
        .padding()
        .background(accentColor.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(accentColor.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Prompt Quality Indicator

struct PromptQualityIndicator: View {
    @Environment(\.colorScheme) private var colorScheme
    let tier: PromptTier

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(index < tierLevel ? tierColor : Color.adaptiveBackgroundTertiary)
                    .frame(width: 8, height: 8)
            }

            Text(tier.displayName)
                .font(.caption)
                .foregroundStyle(Color.adaptiveTextSecondary)
        }
    }

    private var tierLevel: Int {
        switch tier {
        case .basic: return 1
        case .standard: return 2
        case .advanced: return 3
        }
    }

    private var tierColor: Color {
        switch tier {
        case .basic: return Color.adaptiveTextTertiary
        case .standard: return .tierPro(colorScheme)
        case .advanced: return .tierPremium(colorScheme)
        }
    }
}

// MARK: - Previews

#Preview("Usage Indicator") {
    VStack(spacing: 20) {
        UsageIndicator(used: 3, limit: 10)
        UsageIndicator(used: 7, limit: 10)
        UsageIndicator(used: 9, limit: 10)
        UsageIndicator(used: 0, limit: -1)
    }
    .padding()
}

#Preview("Subscription Badge") {
    HStack(spacing: 12) {
        SubscriptionBadge(tier: .free)
        SubscriptionBadge(tier: .pro)
        SubscriptionBadge(tier: .premium)
    }
    .padding()
}

#Preview("Prompt Quality") {
    VStack(spacing: 12) {
        PromptQualityIndicator(tier: .basic)
        PromptQualityIndicator(tier: .standard)
        PromptQualityIndicator(tier: .advanced)
    }
    .padding()
}
