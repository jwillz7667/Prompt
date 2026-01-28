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
    let tintColor: Color?
    let intensity: GlassIntensity

    enum GlassIntensity {
        case subtle    // Light glass, minimal effect
        case standard  // Default glass appearance
        case prominent // Strong glass with more blur and highlights
    }

    init(cornerRadius: CGFloat = 12, isPressed: Bool = false, tintColor: Color? = nil, intensity: GlassIntensity = .standard) {
        self.cornerRadius = cornerRadius
        self.isPressed = isPressed
        self.tintColor = tintColor
        self.intensity = intensity
    }

    private var pressedScale: CGFloat {
        isPressed ? 0.97 : 1.0
    }

    // Border gradient - bright edge highlight for shiny glass effect
    private var borderGradient: LinearGradient {
        if let tint = tintColor {
            return LinearGradient(
                colors: [
                    Color.white.opacity(colorScheme == .dark ? 0.5 : 0.8),
                    tint.opacity(colorScheme == .dark ? 0.6 : 0.5),
                    Color.white.opacity(colorScheme == .dark ? 0.2 : 0.4)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        return LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.4), Color.white.opacity(0.15)]
                : [Color.white.opacity(0.95), Color.white.opacity(0.5)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // Top highlight for shiny 3D glass effect - subtle specular highlight
    private var topHighlight: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.25), Color.white.opacity(0.08), Color.clear]
                : [Color.white.opacity(0.35), Color.white.opacity(0.12), Color.clear],
            startPoint: .top,
            endPoint: .center
        )
    }

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    // Base color layer - high saturation tint color as primary background
                    if let tint = tintColor {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        tint.opacity(colorScheme == .dark ? 0.95 : 0.95),
                                        tint.opacity(colorScheme == .dark ? 0.8 : 0.85)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .saturation(1.3)
                    } else {
                        // Neutral glass base for buttons without tint
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(
                                colorScheme == .dark
                                    ? Color.white.opacity(0.08)
                                    : Color.white.opacity(0.7)
                            )
                    }

                    // Minimal blur material (25% opacity)
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .opacity(tintColor != nil ? 0.25 : 0.5)

                    // Subtle specular highlight for shiny glass look
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(topHighlight)
                        .opacity(intensity == .subtle ? 0.4 : 0.6)

                    // Inner glow for depth - subtle in light mode
                    if tintColor != nil {
                        RoundedRectangle(cornerRadius: cornerRadius - 1, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(colorScheme == .dark ? 0.3 : 0.35),
                                        Color.clear
                                    ],
                                    startPoint: .top,
                                    endPoint: .center
                                ),
                                lineWidth: 1.5
                            )
                            .padding(1)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                // Glass edge border - shiny edge highlight
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(borderGradient, lineWidth: intensity == .prominent ? 1.5 : 1)
            }
            // Shadow with color tint for glow effect
            .shadow(
                color: tintColor?.opacity(colorScheme == .dark ? 0.4 : 0.3) ?? Color.black.opacity(colorScheme == .dark ? 0.4 : 0.15),
                radius: isPressed ? 4 : 10,
                y: isPressed ? 2 : 5
            )
            .scaleEffect(pressedScale)
            .opacity(isPressed ? 0.9 : 1.0)
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
                ? [Color.white.opacity(0.2), Color.white.opacity(0.05), Color.clear]
                : [Color.white.opacity(0.3), Color.white.opacity(0.1), Color.clear],
            startPoint: .top,
            endPoint: .center
        )
    }

    private var borderColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.25)
            : Color.white.opacity(0.8)
    }

    private var shadowColor: Color {
        if isSelected, let accent = accentColor {
            return accent.opacity(colorScheme == .dark ? 0.5 : 0.4)
        }
        return colorScheme == .dark
            ? Color.black.opacity(0.4)
            : Color.brandPurple.opacity(0.15)
    }

    private var shadowRadius: CGFloat {
        isSelected ? 10 : 5
    }

    private var shadowY: CGFloat {
        isSelected ? 5 : 2
    }

    @ViewBuilder
    private var chipBackground: some View {
        if let accent = accentColor, isSelected {
            ZStack {
                // High saturation color base
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                accent.opacity(0.95),
                                accent.opacity(0.8)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .saturation(1.3)

                // Minimal blur (25% opacity)
                Capsule()
                    .fill(.ultraThinMaterial)
                    .opacity(0.25)

                // Subtle specular highlight
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: colorScheme == .dark
                                ? [Color.white.opacity(0.25), Color.white.opacity(0.08), Color.clear]
                                : [Color.white.opacity(0.35), Color.white.opacity(0.12), Color.clear],
                            startPoint: .top,
                            endPoint: .center
                        )
                    )
            }
        } else {
            ZStack {
                // Clear glass base
                Capsule()
                    .fill(
                        colorScheme == .dark
                            ? Color.white.opacity(0.1)
                            : Color.white.opacity(0.8)
                    )

                // Light material (25% opacity)
                Capsule()
                    .fill(.ultraThinMaterial)
                    .opacity(0.25)

                // Shiny highlight
                Capsule()
                    .fill(highlightGradient)
            }
        }
    }

    @ViewBuilder
    private var chipOverlay: some View {
        EmptyView()
    }

    @ViewBuilder
    private var chipBorder: some View {
        if isSelected, let accent = accentColor {
            Capsule()
                .stroke(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(colorScheme == .dark ? 0.4 : 0.6),
                            accent.opacity(colorScheme == .dark ? 0.5 : 0.4),
                            Color.white.opacity(colorScheme == .dark ? 0.15 : 0.3)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        } else {
            Capsule()
                .stroke(
                    LinearGradient(
                        colors: colorScheme == .dark
                            ? [Color.white.opacity(0.35), Color.white.opacity(0.1)]
                            : [Color.white.opacity(0.95), Color.white.opacity(0.4)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        }
    }

    func body(content: Content) -> some View {
        content
            .background {
                chipBackground
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
        isPressed: Bool = false,
        tintColor: Color? = nil,
        intensity: LiquidGlassButtonModifier.GlassIntensity = .standard
    ) -> some View {
        modifier(LiquidGlassButtonModifier(
            cornerRadius: cornerRadius,
            isPressed: isPressed,
            tintColor: tintColor,
            intensity: intensity
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
    let tintColor: Color?
    let intensity: LiquidGlassButtonModifier.GlassIntensity

    init(
        cornerRadius: CGFloat = 14,
        tintColor: Color? = nil,
        intensity: LiquidGlassButtonModifier.GlassIntensity = .standard
    ) {
        self.cornerRadius = cornerRadius
        self.tintColor = tintColor
        self.intensity = intensity
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .liquidGlassButton(
                cornerRadius: cornerRadius,
                isPressed: configuration.isPressed,
                tintColor: tintColor,
                intensity: intensity
            )
    }
}

// MARK: - Glass Primary Button Style (Accent-colored glass)

/// A prominent glass button with accent color tint - use for primary actions
struct GlassPrimaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat

    init(cornerRadius: CGFloat = 14) {
        self.cornerRadius = cornerRadius
    }

    private var accentColor: Color {
        colorScheme == .dark ? Color.brandCyan : Color.brandPurple
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .liquidGlassButton(
                cornerRadius: cornerRadius,
                isPressed: configuration.isPressed,
                tintColor: accentColor,
                intensity: .prominent
            )
    }
}

// MARK: - Glass Secondary Button Style (Subtle glass)

/// A subtle glass button - use for secondary actions
struct GlassSecondaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    let cornerRadius: CGFloat

    init(cornerRadius: CGFloat = 12) {
        self.cornerRadius = cornerRadius
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                ZStack {
                    // Clear glass base
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color.white.opacity(0.12)
                                : Color.white.opacity(0.8)
                        )

                    // Light material for subtle blur
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .opacity(0.4)

                    // Shiny top highlight
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: colorScheme == .dark
                                    ? [Color.white.opacity(0.25), Color.white.opacity(0.05), Color.clear]
                                    : [Color.white.opacity(0.9), Color.white.opacity(0.3), Color.clear],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: colorScheme == .dark
                                ? [Color.white.opacity(0.35), Color.white.opacity(0.1)]
                                : [Color.white.opacity(0.95), Color.white.opacity(0.4)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .shadow(
                color: Color.black.opacity(colorScheme == .dark ? 0.3 : 0.1),
                radius: configuration.isPressed ? 2 : 6,
                y: configuration.isPressed ? 1 : 3
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Glass Icon Button Style (For toolbar/icon buttons)

/// A glass button optimized for icon-only buttons
struct GlassIconButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    let size: CGFloat

    init(size: CGFloat = 40) {
        self.size = size
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: size, height: size)
            .background {
                ZStack {
                    // Clear glass base
                    Circle()
                        .fill(
                            colorScheme == .dark
                                ? Color.white.opacity(0.12)
                                : Color.white.opacity(0.85)
                        )

                    // Light material
                    Circle()
                        .fill(.ultraThinMaterial)
                        .opacity(0.35)

                    // Shiny highlight
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: colorScheme == .dark
                                    ? [Color.white.opacity(0.3), Color.white.opacity(0.05), Color.clear]
                                    : [Color.white.opacity(0.95), Color.white.opacity(0.3), Color.clear],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                }
            }
            .clipShape(Circle())
            .overlay {
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: colorScheme == .dark
                                ? [Color.white.opacity(0.4), Color.white.opacity(0.1)]
                                : [Color.white.opacity(0.95), Color.white.opacity(0.5)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .shadow(
                color: Color.black.opacity(colorScheme == .dark ? 0.35 : 0.12),
                radius: configuration.isPressed ? 2 : 6,
                y: configuration.isPressed ? 1 : 3
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Glass Capsule Button Style

/// A capsule-shaped glass button
struct GlassCapsuleButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    let tintColor: Color?
    let intensity: LiquidGlassButtonModifier.GlassIntensity

    init(tintColor: Color? = nil, intensity: LiquidGlassButtonModifier.GlassIntensity = .standard) {
        self.tintColor = tintColor
        self.intensity = intensity
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                GlassCapsuleBackground(
                    isPressed: configuration.isPressed,
                    tintColor: tintColor,
                    intensity: intensity
                )
            }
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .opacity(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Glass Capsule Background

private struct GlassCapsuleBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    let isPressed: Bool
    let tintColor: Color?
    let intensity: LiquidGlassButtonModifier.GlassIntensity

    var body: some View {
        ZStack {
            // Base color layer - high saturation tint as primary
            if let tint = tintColor {
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                tint.opacity(0.95),
                                tint.opacity(0.8)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .saturation(1.3)
            } else {
                // Neutral glass base
                Capsule()
                    .fill(
                        colorScheme == .dark
                            ? Color.white.opacity(0.1)
                            : Color.white.opacity(0.75)
                    )
            }

            // Minimal blur material (25% opacity)
            Capsule()
                .fill(.ultraThinMaterial)
                .opacity(tintColor != nil ? 0.25 : 0.45)

            // Subtle specular highlight
            Capsule()
                .fill(
                    LinearGradient(
                        colors: colorScheme == .dark
                            ? [Color.white.opacity(0.25), Color.white.opacity(0.08), Color.clear]
                            : [Color.white.opacity(0.35), Color.white.opacity(0.12), Color.clear],
                        startPoint: .top,
                        endPoint: .center
                    )
                )

            // Inner glow for depth on tinted buttons - subtle in light mode
            if tintColor != nil {
                Capsule()
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(colorScheme == .dark ? 0.25 : 0.3),
                                Color.clear
                            ],
                            startPoint: .top,
                            endPoint: .center
                        ),
                        lineWidth: 1.5
                    )
                    .padding(1)
            }
        }
        .clipShape(Capsule())
        .overlay {
            Capsule()
                .stroke(
                    LinearGradient(
                        colors: tintColor != nil
                            ? [
                                Color.white.opacity(colorScheme == .dark ? 0.4 : 0.7),
                                tintColor!.opacity(colorScheme == .dark ? 0.5 : 0.4),
                                Color.white.opacity(colorScheme == .dark ? 0.15 : 0.3)
                              ]
                            : (colorScheme == .dark
                                ? [Color.white.opacity(0.35), Color.white.opacity(0.1)]
                                : [Color.white.opacity(0.95), Color.white.opacity(0.4)]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        }
        .shadow(
            color: tintColor?.opacity(colorScheme == .dark ? 0.35 : 0.25) ?? Color.black.opacity(colorScheme == .dark ? 0.35 : 0.12),
            radius: isPressed ? 3 : 8,
            y: isPressed ? 1 : 4
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
            // Blob 1 - Cyan in dark mode only, purple in light mode
            liquidBlob(
                color: colorScheme == .dark ? Color.brandCyan : Color.brandPurple,
                opacity: colorScheme == .dark ? 0.08 : 0.08,
                frameWidth: size.width * 0.8,
                endRadius: size.width * 0.5,
                offset: animateGradient
                    ? CGSize(width: size.width * 0.2, height: -size.height * 0.1)
                    : CGSize(width: -size.width * 0.1, height: size.height * 0.1)
            )

            // Blob 2 - Purple accent
            liquidBlob(
                color: Color.brandPurple,
                opacity: colorScheme == .dark ? 0.06 : 0.06,
                frameWidth: size.width * 0.7,
                endRadius: size.width * 0.6,
                offset: animateGradient
                    ? CGSize(width: -size.width * 0.15, height: size.height * 0.3)
                    : CGSize(width: size.width * 0.1, height: size.height * 0.2)
            )

            // Blob 3 - Deep purple
            liquidBlob(
                color: Color.brandPurpleDark,
                opacity: colorScheme == .dark ? 0.04 : 0.05,
                frameWidth: size.width * 0.5,
                endRadius: size.width * 0.4,
                offset: animateGradient
                    ? CGSize(width: size.width * 0.3, height: size.height * 0.5)
                    : CGSize(width: size.width * 0.2, height: size.height * 0.4)
            )

            // Blob 4 - Cyan in dark mode only, purple light in light mode
            liquidBlob(
                color: colorScheme == .dark ? Color.brandCyan : Color.brandPurpleLight,
                opacity: colorScheme == .dark ? 0.05 : 0.04,
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

#Preview("Glass Button Styles") {
    VStack(spacing: 16) {
        // Standard glass button
        Button {} label: {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                Text("Standard Glass")
            }
            .font(.headline)
            .foregroundStyle(Color.adaptiveTextPrimary)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        .buttonStyle(LiquidGlassButtonStyle())

        // Primary glass button (with accent tint)
        Button {} label: {
            HStack(spacing: 8) {
                Image(systemName: "star.fill")
                Text("Primary Glass")
            }
            .font(.headline)
            .foregroundStyle(Color.adaptiveTextPrimary)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        .buttonStyle(GlassPrimaryButtonStyle())

        // Secondary glass button (subtle)
        Button {} label: {
            HStack(spacing: 8) {
                Image(systemName: "gear")
                Text("Secondary Glass")
            }
            .font(.subheadline)
            .foregroundStyle(Color.adaptiveTextSecondary)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .buttonStyle(GlassSecondaryButtonStyle())

        // Capsule glass button
        Button {} label: {
            HStack(spacing: 6) {
                Image(systemName: "doc.on.doc")
                Text("Copy")
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Color.adaptiveTextPrimary)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .buttonStyle(GlassCapsuleButtonStyle(tintColor: Color.brandCyan))

        // Icon buttons row
        HStack(spacing: 16) {
            Button {} label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.adaptiveTextPrimary)
            }
            .buttonStyle(GlassIconButtonStyle())

            Button {} label: {
                Image(systemName: "clock.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.adaptiveTextPrimary)
            }
            .buttonStyle(GlassIconButtonStyle())

            Button {} label: {
                Image(systemName: "person.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.adaptiveTextPrimary)
            }
            .buttonStyle(GlassIconButtonStyle())
        }
    }
    .padding(24)
    .background(LiquidGlassBackground())
}
