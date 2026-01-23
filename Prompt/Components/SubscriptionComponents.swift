import SwiftUI

// MARK: - Usage Indicator

struct UsageIndicator: View {
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
        if isUnlimited { return .green }
        if progress >= 0.9 { return .red }
        if progress >= 0.7 { return .orange }
        return .green
    }

    var body: some View {
        HStack(spacing: 8) {
            // Progress ring
            ZStack {
                Circle()
                    .stroke(Color.adaptiveBackgroundTertiary, lineWidth: 3)
                    .frame(width: 24, height: 24)

                if !isUnlimited {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(statusColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .frame(width: 24, height: 24)
                        .rotationEffect(.degrees(-90))
                } else {
                    Image(systemName: "infinity")
                        .font(.caption2.bold())
                        .foregroundStyle(.green)
                }
            }

            // Text
            if isUnlimited {
                Text("Pro")
                    .font(.caption)
                    .foregroundStyle(Color.adaptiveTextSecondary)
            } else {
                Text("\(remaining) left")
                    .font(.caption)
                    .foregroundStyle(statusColor)
            }
        }
    }
}

// MARK: - Subscription Badge

struct SubscriptionBadge: View {
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
            return Color.blue.opacity(0.15)
        case .premium:
            return Color.purple.opacity(0.15)
        }
    }

    private var badgeTextColor: Color {
        switch tier {
        case .free:
            return Color.adaptiveTextSecondary
        case .pro:
            return .blue
        case .premium:
            return .purple
        }
    }
}

// MARK: - Upgrade Prompt Card

struct UpgradePromptCard: View {
    let currentTier: SubscriptionTier
    let onUpgrade: () -> Void

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

                Image(systemName: "arrow.up.circle.fill")
                    .font(.title)
                    .foregroundStyle(currentTier == .free ? .purple : .blue)
            }

            Button(action: onUpgrade) {
                Text("Upgrade Now")
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(currentTier == .free ? Color.purple : Color.blue)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding()
        .background(Color.adaptiveBackgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.adaptiveBorder, lineWidth: 1)
        )
    }

    private var upgradeTitle: String {
        switch currentTier {
        case .free:
            return "Upgrade to Pro or Premium"
        case .pro:
            return "Upgrade to Premium"
        case .premium:
            return "You're on Premium"
        }
    }

    private var upgradeSubtitle: String {
        switch currentTier {
        case .free:
            return "Get better prompts and more daily uses"
        case .pro:
            return "Unlock unlimited prompts and batch mode"
        case .premium:
            return "Enjoying all premium features"
        }
    }
}

// MARK: - Feature Lock Overlay

struct FeatureLockOverlay: View {
    let featureName: String
    let requiredTier: SubscriptionTier
    let onUnlock: () -> Void

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
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(requiredTier == .premium ? Color.purple : Color.blue)
                    .clipShape(Capsule())
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.adaptiveBackgroundPrimary.opacity(0.9))
    }
}

// MARK: - Subscription Status Card

struct SubscriptionStatusCard: View {
    @Environment(StoreKitManager.self) private var storeKit

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
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.orange)
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
        .background(Color.adaptiveBackgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.adaptiveBorder, lineWidth: 1)
        )
    }

    private func usageBarColor(_ percentage: Double) -> Color {
        if percentage >= 0.9 { return .red }
        if percentage >= 0.7 { return .orange }
        return .green
    }
}

// MARK: - Quota Exceeded Banner

struct QuotaExceededBanner: View {
    let onUpgrade: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title2)
                .foregroundStyle(.orange)

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
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.orange)
                    .clipShape(Capsule())
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.orange.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Trial Banner

struct TrialBanner: View {
    let daysRemaining: Int
    let onManage: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "gift.fill")
                .font(.title2)
                .foregroundStyle(.purple)

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
                    .foregroundStyle(.purple)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.purple.opacity(0.15))
                    .clipShape(Capsule())
            }
        }
        .padding()
        .background(Color.purple.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.purple.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Prompt Quality Indicator

struct PromptQualityIndicator: View {
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
        case .basic: return .gray
        case .standard: return .blue
        case .advanced: return .purple
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
