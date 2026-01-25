//
//  LiquidGlassStyles.swift
//  Prompt
//
//  iOS 26 Liquid Glass Design System
//  Brand Colors: Indigo (#5B4CDB) and Cyan (#00E6E6)
//  Dark Mode: Standard iOS black with brand accents
//  Translucent, depth-aware components with specular highlights and refractive effects
//

import SwiftUI
import UIKit

// MARK: - Liquid Glass Material

/// iOS 26 Liquid Glass material variants
enum LiquidGlassMaterial {
    case thin
    case regular
    case thick
    case chrome

    @ViewBuilder
    var background: some View {
        switch self {
        case .thin:
            Color.clear.background(.ultraThinMaterial)
        case .regular:
            Color.clear.background(.thinMaterial)
        case .thick:
            Color.clear.background(.regularMaterial)
        case .chrome:
            Color.clear.background(.thickMaterial)
        }
    }
}

// MARK: - Liquid Glass Card Modifier

struct LiquidGlassModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat
    let material: LiquidGlassMaterial
    let shadowIntensity: Double
    let borderGlow: Bool

    private var specularGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.08), Color.white.opacity(0.03), Color.clear]
                : [Color.white.opacity(0.9), Color.brandPurple.opacity(0.1), Color.clear],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.15), Color.white.opacity(0.05)]
                : [Color.white.opacity(0.95), Color.brandPurple.opacity(0.2), Color.white.opacity(0.6)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var shadowColor: Color {
        colorScheme == .dark
            ? Color.black.opacity(0.6 * shadowIntensity)
            : Color.brandPurple.opacity(0.15 * shadowIntensity)
    }

    private var cardBorderColor: Color {
        if colorScheme == .dark {
            return borderGlow ? Color.brandCyan.opacity(0.4) : Color.white.opacity(0.1)
        } else {
            return Color.white.opacity(0.8)
        }
    }

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    // Solid base - iOS elevated surface in dark, white in light
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color(red: 28/255, green: 28/255, blue: 30/255) // #1C1C1E - iOS elevated
                                : Color.white
                        )

                    // Material layer for glass effect
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    // Subtle tinted overlay
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color.white.opacity(0.02)
                                : Color.brandPurple.opacity(0.03)
                        )

                    // Specular highlight layer
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(specularGradient)
                        .opacity(0.5)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                // Border with gradient for glass edge effect
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(cardBorderColor, lineWidth: borderGlow ? 2 : 1)
            }
            .shadow(color: shadowColor, radius: 16, y: 8)
            .shadow(color: shadowColor.opacity(0.5), radius: 4, y: 2)
    }
}

// MARK: - Liquid Glass Button Modifier

struct LiquidGlassButtonModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat
    let isPressed: Bool

    private var pressedScale: CGFloat {
        isPressed ? 0.97 : 1.0
    }

    private var buttonBorderGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.1), Color.white.opacity(0.05)]
                : [Color.brandPurple.opacity(0.25), Color.brandPurple.opacity(0.15)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var buttonHighlightGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.08), Color.white.opacity(0.02)]
                : [Color.white.opacity(0.9), Color.brandPurple.opacity(0.1)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    // Solid base - iOS elevated surface
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color(red: 44/255, green: 44/255, blue: 46/255) // #2C2C2E - iOS tertiary
                                : Color.white
                        )

                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(buttonHighlightGradient)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(buttonBorderGradient, lineWidth: 1)
            }
            .shadow(
                color: colorScheme == .dark
                    ? Color.black.opacity(0.5)
                    : Color.brandPurple.opacity(0.2),
                radius: isPressed ? 4 : 10,
                y: isPressed ? 2 : 5
            )
            .scaleEffect(pressedScale)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
    }
}

// MARK: - Liquid Glass Input Field Modifier

struct LiquidGlassInputModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat
    let isFocused: Bool

    private var focusBorderColor: Color {
        colorScheme == .dark
            ? Color.brandCyan.opacity(0.8)
            : Color.brandPurple.opacity(0.5)
    }

    private var defaultBorderColor: Color {
        colorScheme == .dark
            ? Color(red: 56/255, green: 56/255, blue: 58/255) // #38383A - iOS separator
            : Color(red: 180/255, green: 175/255, blue: 210/255) // Indigo border
    }

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    // Solid base - iOS elevated surface
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color(red: 28/255, green: 28/255, blue: 30/255) // #1C1C1E - iOS elevated
                                : Color.white
                        )

                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    // Subtle inner layer
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color.white.opacity(0.02)
                                : Color.white.opacity(0.8)
                        )
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(
                        isFocused ? focusBorderColor : defaultBorderColor,
                        lineWidth: isFocused ? 2 : 1
                    )
                    .animation(.easeInOut(duration: 0.2), value: isFocused)
            }
            .overlay {
                // Inner highlight at top
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                colorScheme == .dark ? Color.white.opacity(0.08) : Color.white.opacity(0.6),
                                Color.clear
                            ],
                            startPoint: .top,
                            endPoint: .center
                        ),
                        lineWidth: 1
                    )
                    .padding(1)
            }
            .shadow(
                color: colorScheme == .dark
                    ? Color.black.opacity(0.5)
                    : Color.brandPurple.opacity(0.15),
                radius: isFocused ? 12 : 6,
                y: isFocused ? 6 : 3
            )
    }
}

// MARK: - Liquid Glass Chip Modifier

struct LiquidGlassChipModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    let isSelected: Bool
    let accentColor: Color?

    private var highlightGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.06), Color.white.opacity(0.02)]
                : [Color.white.opacity(0.8), Color.brandPurple.opacity(0.1)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var borderColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.1)
            : Color.brandPurple.opacity(0.2)
    }

    private var shadowColor: Color {
        if isSelected, let accent = accentColor {
            return accent.opacity(0.4)
        }
        return colorScheme == .dark
            ? Color.black.opacity(0.4)
            : Color.brandPurple.opacity(0.1)
    }

    private var shadowRadius: CGFloat {
        isSelected ? 8 : 4
    }

    private var shadowY: CGFloat {
        isSelected ? 4 : 2
    }

    @ViewBuilder
    private var chipBackground: some View {
        if let accent = accentColor, isSelected {
            Capsule()
                .fill(
                    LinearGradient(
                        colors: [accent, accent.opacity(0.85)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        } else {
            ZStack {
                // Solid base - iOS elevated surface
                Capsule()
                    .fill(
                        colorScheme == .dark
                            ? Color(red: 44/255, green: 44/255, blue: 46/255) // #2C2C2E - iOS tertiary
                            : Color.white
                    )
                Capsule()
                    .fill(.ultraThinMaterial)
            }
        }
    }

    @ViewBuilder
    private var chipOverlay: some View {
        if !isSelected || accentColor == nil {
            Capsule()
                .fill(highlightGradient)
        }
    }

    @ViewBuilder
    private var chipBorder: some View {
        if isSelected && accentColor != nil {
            Capsule().stroke(Color.clear, lineWidth: 1)
        } else {
            Capsule().stroke(borderColor, lineWidth: 1)
        }
    }

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    chipBackground
                    chipOverlay
                }
            }
            .clipShape(Capsule())
            .overlay { chipBorder }
            .shadow(color: shadowColor, radius: shadowRadius, y: shadowY)
            .scaleEffect(isSelected ? 1.02 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isSelected)
    }
}

// MARK: - Liquid Glass Section Header

struct LiquidGlassSectionHeader: View {
    @Environment(\.colorScheme) private var colorScheme

    let title: String
    let icon: String
    var trailing: AnyView? = nil

    private var textColor: Color {
        Color.adaptiveTextPrimary
    }

    var body: some View {
        HStack {
            Label(title, systemImage: icon)
                .font(.system(.subheadline, weight: .semibold))
                .foregroundStyle(textColor)

            Spacer()

            if let trailing = trailing {
                trailing
            }
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Liquid Glass Divider

struct LiquidGlassDivider: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [
                        Color.clear,
                        colorScheme == .dark
                            ? Color.white.opacity(0.15)
                            : Color.brandPurple.opacity(0.15),
                        Color.clear
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(height: 1)
    }
}

// MARK: - View Extensions

extension View {
    /// Apply Liquid Glass card styling
    func liquidGlass(
        cornerRadius: CGFloat = 20,
        material: LiquidGlassMaterial = .regular,
        shadowIntensity: Double = 1.0,
        borderGlow: Bool = false
    ) -> some View {
        modifier(LiquidGlassModifier(
            cornerRadius: cornerRadius,
            material: material,
            shadowIntensity: shadowIntensity,
            borderGlow: borderGlow
        ))
    }

    /// Apply Liquid Glass button styling
    func liquidGlassButton(
        cornerRadius: CGFloat = 12,
        isPressed: Bool = false
    ) -> some View {
        modifier(LiquidGlassButtonModifier(
            cornerRadius: cornerRadius,
            isPressed: isPressed
        ))
    }

    /// Apply Liquid Glass input field styling
    func liquidGlassInput(
        cornerRadius: CGFloat = 16,
        isFocused: Bool = false
    ) -> some View {
        modifier(LiquidGlassInputModifier(
            cornerRadius: cornerRadius,
            isFocused: isFocused
        ))
    }

    /// Apply Liquid Glass chip styling
    func liquidGlassChip(
        isSelected: Bool = false,
        accentColor: Color? = nil
    ) -> some View {
        modifier(LiquidGlassChipModifier(
            isSelected: isSelected,
            accentColor: accentColor
        ))
    }
}

// MARK: - Liquid Glass Button Style

struct LiquidGlassButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat

    init(cornerRadius: CGFloat = 14) {
        self.cornerRadius = cornerRadius
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .liquidGlassButton(
                cornerRadius: cornerRadius,
                isPressed: configuration.isPressed
            )
    }
}

// MARK: - Animated Gradient Background

struct LiquidGlassBackground: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var animateGradient = false

    private var backgroundColor: Color {
        colorScheme == .dark
            ? Color.black // Pure black for OLED
            : Color(red: 250/255, green: 249/255, blue: 255/255) // #FAF9FF - slight indigo tint
    }

    var body: some View {
        ZStack {
            // Base color
            backgroundColor

            // Subtle animated gradient blobs (much more subtle in dark mode)
            GeometryReader { geometry in
                liquidGradientBlobs(in: geometry)
                    .blur(radius: colorScheme == .dark ? 80 : 60)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 8).repeatForever(autoreverses: true)) {
                animateGradient = true
            }
        }
    }

    @ViewBuilder
    private func liquidGradientBlobs(in geometry: GeometryProxy) -> some View {
        let size = geometry.size
        ZStack {
            // Blob 1 - Cyan accent (very subtle in dark mode)
            liquidBlob(
                color: Color.brandCyan,
                opacity: colorScheme == .dark ? 0.08 : 0.15,
                frameWidth: size.width * 0.8,
                endRadius: size.width * 0.5,
                offset: animateGradient
                    ? CGSize(width: size.width * 0.2, height: -size.height * 0.1)
                    : CGSize(width: -size.width * 0.1, height: size.height * 0.1)
            )

            // Blob 2 - Purple accent (very subtle in dark mode)
            liquidBlob(
                color: Color.brandPurple,
                opacity: colorScheme == .dark ? 0.06 : 0.1,
                frameWidth: size.width * 0.7,
                endRadius: size.width * 0.6,
                offset: animateGradient
                    ? CGSize(width: -size.width * 0.15, height: size.height * 0.3)
                    : CGSize(width: size.width * 0.1, height: size.height * 0.2)
            )

            // Blob 3 - Deep purple (minimal in dark mode)
            liquidBlob(
                color: Color.brandPurpleDark,
                opacity: colorScheme == .dark ? 0.04 : 0.08,
                frameWidth: size.width * 0.5,
                endRadius: size.width * 0.4,
                offset: animateGradient
                    ? CGSize(width: size.width * 0.3, height: size.height * 0.5)
                    : CGSize(width: size.width * 0.2, height: size.height * 0.4)
            )

            // Blob 4 - Cyan glow at bottom (subtle in dark mode)
            liquidBlob(
                color: Color.brandCyan,
                opacity: colorScheme == .dark ? 0.05 : 0.1,
                frameWidth: size.width * 0.6,
                endRadius: size.width * 0.5,
                offset: animateGradient
                    ? CGSize(width: -size.width * 0.1, height: size.height * 0.7)
                    : CGSize(width: size.width * 0.15, height: size.height * 0.6)
            )
        }
    }

    private func liquidBlob(
        color: Color,
        opacity: Double,
        frameWidth: CGFloat,
        endRadius: CGFloat,
        offset: CGSize
    ) -> some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [color.opacity(opacity), Color.clear],
                    center: .center,
                    startRadius: 0,
                    endRadius: endRadius
                )
            )
            .frame(width: frameWidth)
            .offset(x: offset.width, y: offset.height)
    }
}

// MARK: - Previews

#Preview("Liquid Glass Card") {
    VStack(spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
            Text("Liquid Glass Card")
                .font(.headline)
                .foregroundStyle(Color.adaptiveTextPrimary)
            Text("Beautiful translucent effect with specular highlights")
                .font(.caption)
                .foregroundStyle(Color.adaptiveTextSecondary)
        }
        .padding(20)
        .liquidGlass(cornerRadius: 20)
    }
    .padding()
    .background(LiquidGlassBackground())
}

#Preview("Liquid Glass Components") {
    VStack(spacing: 20) {
        // Chips
        HStack(spacing: 10) {
            Text("Selected")
                .font(.caption.bold())
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .foregroundStyle(.white)
                .liquidGlassChip(isSelected: true, accentColor: Color.brandCyan)

            Text("Default")
                .font(.caption.bold())
                .foregroundStyle(Color.adaptiveTextSecondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .liquidGlassChip(isSelected: false)
        }

        // Button
        Button("Liquid Glass Button") {}
            .font(.headline)
            .foregroundStyle(Color.adaptiveTextPrimary)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .buttonStyle(LiquidGlassButtonStyle())

        // Input
        Text("Input Field")
            .font(.body)
            .foregroundStyle(Color.adaptiveTextPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .liquidGlassInput(cornerRadius: 12, isFocused: false)

        LiquidGlassDivider()
            .padding(.horizontal, 20)
    }
    .padding()
    .background(LiquidGlassBackground())
}
