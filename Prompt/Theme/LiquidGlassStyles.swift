//
//  LiquidGlassStyles.swift
//  Prompt
//
//  iOS 26 Liquid Glass Design System
//  Brand Colors: Purple (#512AD4) and Cyan (#00FFF9)
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
                ? [Color.brandCyan.opacity(0.15), Color.white.opacity(0.08), Color.clear]
                : [Color.white.opacity(0.9), Color.brandPurple.opacity(0.1), Color.clear],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.brandCyan.opacity(0.4), Color.white.opacity(0.1), Color.brandCyan.opacity(0.2)]
                : [Color.white.opacity(0.95), Color.brandPurple.opacity(0.2), Color.white.opacity(0.6)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var shadowColor: Color {
        colorScheme == .dark
            ? Color.black.opacity(0.5 * shadowIntensity)
            : Color.brandPurple.opacity(0.15 * shadowIntensity)
    }

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    // Base material layer
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    // Tinted overlay for depth - purple tint
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color.brandPurpleLight.opacity(0.15)
                                : Color.brandPurple.opacity(0.05)
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
                    .stroke(borderGradient, lineWidth: borderGlow ? 1.5 : 1)
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

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: colorScheme == .dark
                                    ? [Color.brandCyan.opacity(0.1), Color.white.opacity(0.05)]
                                    : [Color.white.opacity(0.9), Color.brandPurple.opacity(0.1)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                colorScheme == .dark ? Color.brandCyan.opacity(0.3) : Color.white.opacity(0.8),
                                colorScheme == .dark ? Color.white.opacity(0.1) : Color.brandPurple.opacity(0.2)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .shadow(
                color: colorScheme == .dark
                    ? Color.black.opacity(0.4)
                    : Color.brandPurple.opacity(0.15),
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

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    // Inner shadow effect for recessed appearance
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color.brandPurpleDark.opacity(0.3)
                                : Color.white.opacity(0.7)
                        )
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(
                        isFocused ? focusBorderColor : Color.clear,
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
                                colorScheme == .dark ? Color.brandCyan.opacity(0.15) : Color.white.opacity(0.6),
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
                    ? Color.black.opacity(0.3)
                    : Color.brandPurple.opacity(0.1),
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
                ? [Color.brandCyan.opacity(0.08), Color.white.opacity(0.03)]
                : [Color.white.opacity(0.8), Color.brandPurple.opacity(0.1)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: [
                colorScheme == .dark ? Color.brandCyan.opacity(0.25) : Color.white.opacity(0.7),
                colorScheme == .dark ? Color.white.opacity(0.1) : Color.brandPurple.opacity(0.2)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var shadowColor: Color {
        if isSelected, let accent = accentColor {
            return accent.opacity(0.4)
        }
        return colorScheme == .dark
            ? Color.black.opacity(0.3)
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
                        colors: [accent, accent.opacity(0.8)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        } else {
            Capsule()
                .fill(.ultraThinMaterial)
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
            Capsule().stroke(borderGradient, lineWidth: 1)
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
                            ? Color.brandCyan.opacity(0.3)
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
            ? Color.brandPurple
            : Color.white
    }

    var body: some View {
        ZStack {
            // Base color
            backgroundColor

            // Animated mesh gradient simulation
            GeometryReader { geometry in
                liquidGradientBlobs(in: geometry)
                    .blur(radius: 60)
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
            // Blob 1 - Cyan accent
            liquidBlob(
                color: Color.brandCyan,
                opacity: colorScheme == .dark ? 0.25 : 0.15,
                frameWidth: size.width * 0.8,
                endRadius: size.width * 0.5,
                offset: animateGradient
                    ? CGSize(width: size.width * 0.2, height: -size.height * 0.1)
                    : CGSize(width: -size.width * 0.1, height: size.height * 0.1)
            )

            // Blob 2 - Purple accent
            liquidBlob(
                color: Color.brandPurpleLight,
                opacity: colorScheme == .dark ? 0.2 : 0.1,
                frameWidth: size.width * 0.7,
                endRadius: size.width * 0.6,
                offset: animateGradient
                    ? CGSize(width: -size.width * 0.15, height: size.height * 0.3)
                    : CGSize(width: size.width * 0.1, height: size.height * 0.2)
            )

            // Blob 3 - Deep purple
            liquidBlob(
                color: Color.brandPurpleDark,
                opacity: colorScheme == .dark ? 0.15 : 0.08,
                frameWidth: size.width * 0.5,
                endRadius: size.width * 0.4,
                offset: animateGradient
                    ? CGSize(width: size.width * 0.3, height: size.height * 0.5)
                    : CGSize(width: size.width * 0.2, height: size.height * 0.4)
            )

            // Blob 4 - Cyan glow at bottom
            liquidBlob(
                color: Color.brandCyan,
                opacity: colorScheme == .dark ? 0.15 : 0.1,
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
