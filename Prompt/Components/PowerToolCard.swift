//
//  PowerToolCard.swift
//  Prompt
//
//  Individual card in the Power Tools 2x2 grid. Pure presentational.
//

import SwiftUI

struct PowerToolCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let icon: String
    let title: String
    let subtitle: String
    let cardColor: Color
    let isExpanded: Bool
    let isLocked: Bool
    let requiredTier: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(isLocked ? Color.adaptiveTextTertiary : cardColor)

                    Spacer()

                    // Expand/collapse chevron
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.adaptiveTextTertiary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isExpanded)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(isLocked ? Color.adaptiveTextSecondary : Color.adaptiveTextPrimary)

                    Text(subtitle)
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(Color.adaptiveTextTertiary)
                        .lineLimit(1)
                }

                // Lock badge with tier text
                if isLocked, let tier = requiredTier {
                    HStack(spacing: 3) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 8, weight: .bold))
                        Text(tier)
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.orange.opacity(0.12))
                    .clipShape(Capsule())
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: 14, borderGlow: isExpanded)
            .opacity(isLocked ? 0.75 : 1.0)
        }
        .buttonStyle(PowerToolPressStyle())
    }
}

// MARK: - Press Style

private struct PowerToolPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
