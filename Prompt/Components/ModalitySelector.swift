//
//  ModalitySelector.swift
//  Prompt
//
//  iOS 26 Liquid Glass horizontal chip picker for selecting prompt modality
//  Optimizes prompts for different AI generation types
//  AAA WCAG Compliant Colors with Liquid Glass Design
//

import SwiftUI

struct ModalitySelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedModality: ModalityType
    var onChange: (() -> Void)?

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Target AI", systemImage: "cpu.fill")
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(textPrimary)

                Spacer()

                Text(selectedModality.description)
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(ModalityType.allCases) { modality in
                        ModalityChip(
                            modality: modality,
                            isSelected: selectedModality == modality,
                            action: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    selectedModality = modality
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

// MARK: - Modality Chip

struct ModalityChip: View {
    @Environment(\.colorScheme) private var colorScheme
    let modality: ModalityType
    let isSelected: Bool
    let action: () -> Void

    private var textSecondary: Color { Color.adaptiveTextSecondary }

    private var accentColor: Color {
        switch modality {
        case .text: return Color.brandPurple
        case .image: return .pink
        case .video: return .red
        case .audio: return .orange
        case .code: return .green
        case .threeD: return .blue
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: modality.icon)
                    .font(.system(size: 12, weight: .medium))

                Text(modality.displayName)
                    .font(.system(.caption, weight: .semibold))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .foregroundStyle(isSelected ? .white : textSecondary)
            .liquidGlassChip(
                isSelected: isSelected,
                accentColor: isSelected ? accentColor : nil
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Compact Modality Selector (for toolbar or inline use)

struct CompactModalitySelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedModality: ModalityType
    var onChange: (() -> Void)?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    private var accentColor: Color {
        switch selectedModality {
        case .text: return Color.brandPurple
        case .image: return .pink
        case .video: return .red
        case .audio: return .orange
        case .code: return .green
        case .threeD: return .blue
        }
    }

    var body: some View {
        Menu {
            ForEach(ModalityType.allCases) { modality in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selectedModality = modality
                    }
                    triggerHaptic()
                    onChange?()
                } label: {
                    Label {
                        VStack(alignment: .leading) {
                            Text(modality.displayName)
                            Text(modality.description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: modality.icon)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: selectedModality.icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(accentColor)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(bgSecondary)
            .clipShape(Capsule())
        }
    }

    private func triggerHaptic() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }
}

// MARK: - Inline Modality Picker (single row with icons only)

struct InlineModalityPicker: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedModality: ModalityType
    var onChange: (() -> Void)?

    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgTertiary: Color { Color.adaptiveBackgroundTertiary }

    private func accentColor(for modality: ModalityType) -> Color {
        switch modality {
        case .text: return Color.brandPurple
        case .image: return .pink
        case .video: return .red
        case .audio: return .orange
        case .code: return .green
        case .threeD: return .blue
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(ModalityType.allCases) { modality in
                Button {
                    withAnimation(.spring(response: 0.25)) {
                        selectedModality = modality
                    }
                    triggerHaptic()
                    onChange?()
                } label: {
                    Image(systemName: modality.icon)
                        .font(.system(size: 14, weight: .medium))
                        .frame(width: 32, height: 32)
                        .background(selectedModality == modality ? accentColor(for: modality) : bgTertiary)
                        .foregroundStyle(selectedModality == modality ? .white : textSecondary)
                        .clipShape(Circle())
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

// MARK: - Compact Audio Sub-Modality Selector

struct CompactAudioSubModalitySelector: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedSubModality: AudioSubModalityType
    var onChange: (() -> Void)?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    var body: some View {
        Menu {
            ForEach(AudioSubModalityType.allCases) { subModality in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selectedSubModality = subModality
                    }
                    triggerHaptic()
                    onChange?()
                } label: {
                    Label {
                        VStack(alignment: .leading) {
                            Text(subModality.displayName)
                            Text(subModality.description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: subModality.icon)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: selectedSubModality.icon)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.orange)
                Text(selectedSubModality.displayName)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(textPrimary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 7, weight: .bold))
                    .foregroundStyle(textSecondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(bgSecondary)
            .clipShape(Capsule())
        }
    }

    private func triggerHaptic() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }
}

#Preview {
    VStack(spacing: 20) {
        ModalitySelector(selectedModality: .constant(.text))

        CompactModalitySelector(selectedModality: .constant(.image))

        CompactAudioSubModalitySelector(selectedSubModality: .constant(.music))

        InlineModalityPicker(selectedModality: .constant(.code))
    }
    .padding()
}
