//
//  LengthSelector.swift
//  Prompt
//
//  Segmented control for selecting output length
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct LengthSelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedLength: OutputLength
    var onChange: (() -> Void)?

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var bgTertiary: Color { Color.adaptiveBackgroundTertiary }
    private var borderColor: Color { Color.adaptiveBorder }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Length", systemImage: "ruler")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Spacer()

                Text(selectedLength.description)
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
            }

            HStack(spacing: 0) {
                ForEach(OutputLength.allCases) { length in
                    LengthSegment(
                        length: length,
                        isSelected: selectedLength == length,
                        isFirst: length == .concise,
                        isLast: length == .detailed,
                        action: {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                selectedLength = length
                            }
                            triggerHaptic()
                            onChange?()
                        }
                    )
                }
            }
            .background(bgTertiary)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
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

// MARK: - Length Segment

struct LengthSegment: View {
    @Environment(\.colorScheme) private var colorScheme
    let length: OutputLength
    let isSelected: Bool
    let isFirst: Bool
    let isLast: Bool
    let action: () -> Void

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: length.icon)
                    .font(.system(size: 14, weight: .medium))

                Text(length.displayName)
                    .font(.system(.caption2, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isSelected ? buttonPrimary : .clear)
            .foregroundStyle(isSelected ? (colorScheme == .dark ? .black : .white) : textSecondary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Compact Length Selector

struct CompactLengthSelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedLength: OutputLength
    var onChange: (() -> Void)?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        Menu {
            ForEach(OutputLength.allCases) { length in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selectedLength = length
                    }
                    onChange?()
                } label: {
                    Label {
                        VStack(alignment: .leading) {
                            Text(length.displayName)
                            Text(length.description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: length.icon)
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: selectedLength.icon)
                    .font(.system(size: 14, weight: .medium))
                Text(selectedLength.displayName)
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

// MARK: - Inline Length Picker (single row)

struct InlineLengthPicker: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedLength: OutputLength
    var onChange: (() -> Void)?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgTertiary: Color { Color.adaptiveBackgroundTertiary }
    private var buttonPrimary: Color { Color.adaptiveButtonPrimary }

    var body: some View {
        HStack(spacing: 8) {
            ForEach(OutputLength.allCases) { length in
                Button {
                    withAnimation(.spring(response: 0.25)) {
                        selectedLength = length
                    }
                    triggerHaptic()
                    onChange?()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: length.icon)
                            .font(.system(size: 11, weight: .medium))
                        Text(length.displayName)
                            .font(.system(.caption2, weight: .semibold))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(selectedLength == length ? buttonPrimary : bgTertiary)
                    .foregroundStyle(selectedLength == length ? (colorScheme == .dark ? .black : .white) : textSecondary)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func triggerHaptic() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }
}

#Preview {
    VStack(spacing: 20) {
        LengthSelector(selectedLength: .constant(.standard))

        CompactLengthSelector(selectedLength: .constant(.detailed))

        InlineLengthPicker(selectedLength: .constant(.concise))
    }
    .padding()
}
