//
//  ToneSelector.swift
//  Prompt
//
//  iOS 26 Liquid Glass horizontal chip picker for selecting enhancement tone
//  AAA WCAG Compliant Colors with Liquid Glass Design
//

import SwiftUI

struct ToneSelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(StoreKitManager.self) private var storeKit
    @Binding var selectedTone: ToneType
    var onChange: (() -> Void)?
    var onPremiumTap: (() -> Void)?

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    private var isPremium: Bool {
        storeKit.currentTier == .premium
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Tone", systemImage: "mic.fill")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Spacer()

                HStack(spacing: 4) {
                    if selectedTone == .unchained {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.yellow)
                    }
                    Text(selectedTone.displayName)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(textSecondary)
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(ToneType.allCases) { tone in
                        ToneChip(
                            tone: tone,
                            isSelected: selectedTone == tone,
                            isPremiumUser: isPremium,
                            action: {
                                if tone.isPremium && !isPremium {
                                    onPremiumTap?()
                                    return
                                }
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    selectedTone = tone
                                }
                                triggerHaptic()
                                onChange?()
                            }
                        )
                    }
                }
                .padding(.horizontal, 2)
                .padding(.vertical, 2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .liquidGlass(cornerRadius: 16, shadowIntensity: 0.8)
    }

    private func triggerHaptic() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }
}

// MARK: - Tone Chip

struct ToneChip: View {
    @Environment(\.colorScheme) private var colorScheme
    let tone: ToneType
    let isSelected: Bool
    var isPremiumUser: Bool = true
    let action: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    private var isLocked: Bool {
        tone.isPremium && !isPremiumUser
    }

    private var accentColor: Color? {
        if tone == .unchained {
            return .purple
        }
        return isSelected ? Color.brandPurple : nil
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if tone == .unchained {
                    Image(systemName: isLocked ? "lock.fill" : tone.icon)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(isSelected ? .yellow : (isLocked ? .gray : .purple))
                } else {
                    Image(systemName: tone.icon)
                        .font(.system(size: 12, weight: .medium))
                }

                Text(tone.displayName)
                    .font(.system(.caption, weight: .semibold))

                if tone == .unchained && !isLocked {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(.yellow)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .foregroundStyle(
                isSelected
                    ? .white
                    : (isLocked ? .gray : textSecondary)
            )
            .liquidGlassChip(
                isSelected: isSelected,
                accentColor: tone == .unchained
                    ? (isSelected ? .purple : nil)
                    : (isSelected ? Color.brandPurple : nil)
            )
        }
        .buttonStyle(.plain)
        .opacity(isLocked ? 0.7 : 1.0)
    }
}

// MARK: - Compact Tone Selector (for toolbar or inline use)

struct CompactToneSelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(StoreKitManager.self) private var storeKit
    @Binding var selectedTone: ToneType
    var onChange: (() -> Void)?
    var onPremiumTap: (() -> Void)?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    private var isPremium: Bool {
        storeKit.currentTier == .premium
    }

    var body: some View {
        Menu {
            ForEach(ToneType.allCases) { tone in
                Button {
                    if tone.isPremium && !isPremium {
                        onPremiumTap?()
                        return
                    }
                    withAnimation(.spring(response: 0.3)) {
                        selectedTone = tone
                    }
                    onChange?()
                } label: {
                    HStack {
                        Label(tone.displayName, systemImage: tone.icon)
                        if tone.isPremium && !isPremium {
                            Image(systemName: "lock.fill")
                        } else if tone == .unchained {
                            Image(systemName: "bolt.fill")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: selectedTone.icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(selectedTone == .unchained ? .purple : textPrimary)
                Text(selectedTone.displayName)
                    .font(.system(.caption, weight: .semibold))
                if selectedTone == .unchained {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(.yellow)
                }
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(textPrimary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                selectedTone == .unchained
                    ? AnyShapeStyle(LinearGradient(colors: [.purple.opacity(0.2), .indigo.opacity(0.2)], startPoint: .leading, endPoint: .trailing))
                    : AnyShapeStyle(bgSecondary)
            )
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(selectedTone == .unchained ? Color.purple.opacity(0.5) : .clear, lineWidth: 1)
            )
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        ToneSelector(selectedTone: .constant(.professional))

        CompactToneSelector(selectedTone: .constant(.creative))
    }
    .padding()
}
