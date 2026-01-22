//
//  ToneSelector.swift
//  Prompt
//
//  Horizontal chip picker for selecting enhancement tone
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct ToneSelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedTone: ToneType
    var onChange: (() -> Void)?

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var bgTertiary: Color { Color.adaptiveBackgroundTertiary }
    private var borderColor: Color { Color.adaptiveBorder }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Tone", systemImage: "mic.fill")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Spacer()

                Text(selectedTone.displayName)
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(ToneType.allCases) { tone in
                        ToneChip(
                            tone: tone,
                            isSelected: selectedTone == tone,
                            action: {
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
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
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
    let action: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgTertiary: Color { Color.adaptiveBackgroundTertiary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: tone.icon)
                    .font(.system(size: 12, weight: .medium))

                Text(tone.displayName)
                    .font(.system(.caption, weight: .semibold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? buttonPrimary : bgTertiary)
            .foregroundStyle(isSelected ? (colorScheme == .dark ? .black : .white) : textSecondary)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(isSelected ? .clear : Color.adaptiveBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .scaleEffect(isSelected ? 1.02 : 1.0)
        .animation(.spring(response: 0.2), value: isSelected)
    }
}

// MARK: - Compact Tone Selector (for toolbar or inline use)

struct CompactToneSelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedTone: ToneType
    var onChange: (() -> Void)?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        Menu {
            ForEach(ToneType.allCases) { tone in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selectedTone = tone
                    }
                    onChange?()
                } label: {
                    Label(tone.displayName, systemImage: tone.icon)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: selectedTone.icon)
                    .font(.system(size: 14, weight: .medium))
                Text(selectedTone.displayName)
                    .font(.system(.caption, weight: .semibold))
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(textPrimary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bgSecondary)
            .clipShape(Capsule())
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
