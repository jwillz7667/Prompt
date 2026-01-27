//
//  LoadingAnimations.swift
//  Prompt
//
//  Custom loading animations and micro-interactions for iOS 26
//  Brand Colors: Purple (#512AD4) and Cyan (#00FFF9)
//

import SwiftUI

// MARK: - Logo Enhancement Animation

/// Animation that uses the AppLogo with pulsing, rotating effects during prompt enhancement
struct LogoEnhancementAnimation: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var rotation: Double = 0
    @State private var pulse: CGFloat = 1.0
    @State private var ringRotation1: Double = 0
    @State private var ringRotation2: Double = 0

    let size: CGFloat

    init(size: CGFloat = 120) {
        self.size = size
    }

    // Adaptive accent color - purple in light mode, cyan in dark mode
    private var accentColor: Color {
        colorScheme == .light ? Color.brandPurple : Color.brandCyan
    }

    var body: some View {
        ZStack {
            // Outer rotating ring
            Circle()
                .stroke(
                    AngularGradient(
                        colors: [
                            accentColor.opacity(0.6),
                            Color.brandPurple.opacity(0.3),
                            accentColor.opacity(0.6)
                        ],
                        center: .center
                    ),
                    lineWidth: 3
                )
                .frame(width: size * 1.3, height: size * 1.3)
                .rotationEffect(.degrees(ringRotation1))
                .blur(radius: 2)

            // Inner rotating ring
            Circle()
                .stroke(
                    AngularGradient(
                        colors: [
                            accentColor.opacity(0.8),
                            Color.clear,
                            accentColor.opacity(0.8)
                        ],
                        center: .center
                    ),
                    lineWidth: 2
                )
                .frame(width: size * 1.15, height: size * 1.15)
                .rotationEffect(.degrees(-ringRotation2))

            // Logo without glow
            Group {
                if UIImage(named: "AppLogo") != nil {
                    Image("AppLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: size * 0.7, height: size * 0.7)
                } else {
                    // Fallback icon
                    Image(systemName: "sparkles")
                        .font(.system(size: size * 0.4, weight: .medium))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [accentColor, Color.white],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
            }
            .scaleEffect(pulse)

            // Orbiting particles
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [accentColor, accentColor.opacity(0.3)],
                            center: .center,
                            startRadius: 0,
                            endRadius: 6
                        )
                    )
                    .frame(width: 8, height: 8)
                    .offset(x: cos((rotation + Double(index) * 120) * .pi / 180) * size * 0.55)
                    .offset(y: sin((rotation + Double(index) * 120) * .pi / 180) * size * 0.55)
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                rotation = 360
            }
            withAnimation(.linear(duration: 4).repeatForever(autoreverses: false)) {
                ringRotation1 = 360
            }
            withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                ringRotation2 = 360
            }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                pulse = 1.08
            }
        }
    }
}

// MARK: - AI Orb Loading Animation (Updated with brand colors)

struct AIOrb: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var rotation1: Double = 0
    @State private var rotation2: Double = 0
    @State private var rotation3: Double = 0
    @State private var pulse: CGFloat = 1.0

    let size: CGFloat
    let primaryColor: Color
    let providedAccentColor: Color?

    // Use purple in light mode, cyan in dark mode
    private var accentColor: Color {
        if let provided = providedAccentColor {
            return colorScheme == .light ? Color.brandPurple : provided
        }
        return colorScheme == .light ? Color.brandPurple : Color.brandCyan
    }

    init(size: CGFloat = 120, primaryColor: Color = .white, accentColor: Color? = nil) {
        self.size = size
        self.primaryColor = primaryColor
        self.providedAccentColor = accentColor
    }

    var body: some View {
        ZStack {

            // Orbital ring 1 - Horizontal ellipse
            Ellipse()
                .stroke(
                    AngularGradient(
                        colors: [accentColor.opacity(0.2), accentColor, accentColor.opacity(0.2)],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 2.5, lineCap: .round)
                )
                .frame(width: size, height: size * 0.3)
                .rotationEffect(.degrees(rotation1))

            // Orbital ring 2 - Tilted ellipse
            Ellipse()
                .stroke(
                    AngularGradient(
                        colors: [primaryColor.opacity(0.2), primaryColor.opacity(0.8), primaryColor.opacity(0.2)],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 2, lineCap: .round)
                )
                .frame(width: size * 0.95, height: size * 0.35)
                .rotationEffect(.degrees(-rotation2 + 60))

            // Orbital ring 3 - Another angle
            Ellipse()
                .stroke(
                    AngularGradient(
                        colors: [accentColor.opacity(0.1), accentColor.opacity(0.6), accentColor.opacity(0.1)],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 1.5, lineCap: .round)
                )
                .frame(width: size * 0.9, height: size * 0.25)
                .rotationEffect(.degrees(rotation3 - 30))

            // Core sphere with gradient (no glow shadow)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            accentColor.opacity(0.95),
                            accentColor.opacity(0.7),
                            Color.brandPurple.opacity(0.4)
                        ],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: size * 0.25
                    )
                )
                .frame(width: size * 0.4, height: size * 0.4)
                .scaleEffect(pulse)

            // Inner highlight on sphere
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color.white.opacity(0.9), Color.clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size * 0.12, height: size * 0.12)
                .offset(x: -size * 0.06, y: -size * 0.06)
                .blur(radius: 3)

            // Orbiting particles
            Circle()
                .fill(accentColor)
                .frame(width: 8, height: 8)
                .shadow(color: accentColor, radius: 6)
                .offset(x: cos(rotation1 * .pi / 180) * size * 0.5,
                        y: sin(rotation1 * .pi / 180) * size * 0.15)

            Circle()
                .fill(primaryColor)
                .frame(width: 6, height: 6)
                .shadow(color: primaryColor, radius: 4)
                .offset(x: cos((-rotation2 + 60) * .pi / 180) * size * 0.475,
                        y: sin((-rotation2 + 60) * .pi / 180) * size * 0.175)
        }
        .onAppear {
            withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                rotation1 = 360
            }
            withAnimation(.linear(duration: 4).repeatForever(autoreverses: false)) {
                rotation2 = 360
            }
            withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                rotation3 = 360
            }
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                pulse = 1.1
            }
        }
    }
}

// MARK: - Waveform Visualizer

struct WaveformVisualizer: View {
    @State private var amplitudes: [CGFloat] = Array(repeating: 0.3, count: 5)
    let color: Color

    init(color: Color = Color.brandCyan) {
        self.color = color
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<5, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2)
                    .fill(color)
                    .frame(width: 4, height: 12 + amplitudes[index] * 20)
            }
        }
        .onAppear {
            for i in 0..<5 {
                withAnimation(
                    .easeInOut(duration: 0.4 + Double(i) * 0.1)
                    .repeatForever(autoreverses: true)
                    .delay(Double(i) * 0.1)
                ) {
                    amplitudes[i] = CGFloat.random(in: 0.5...1.0)
                }
            }
        }
    }
}

// MARK: - Prompt Enhancement Loader (Logo-based)

struct PromptEnhancementLoader: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var currentPhase = 0
    @State private var displayedText = ""
    @State private var isTyping = false

    let phases = [
        "Analyzing your prompt",
        "Applying AI enhancement",
        "Optimizing structure",
        "Refining output"
    ]

    private var primaryColor: Color { Color.adaptiveTextPrimary }
    private var secondaryColor: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        VStack(spacing: 32) {
            // Logo-based animation
            LogoEnhancementAnimation(size: 140)

            // Status section
            VStack(spacing: 12) {
                // Typing text with cursor
                HStack(spacing: 2) {
                    Text(displayedText)
                        .font(.system(.body, design: .rounded, weight: .medium))
                        .foregroundStyle(primaryColor)

                    // Blinking cursor
                    Rectangle()
                        .fill(accentColor)
                        .frame(width: 2, height: 18)
                        .opacity(isTyping ? 1 : 0)
                        .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isTyping)
                }
                .frame(height: 24)

                // Waveform indicator
                WaveformVisualizer(color: accentColor.opacity(0.8))
            }
        }
        .onAppear {
            isTyping = true
            typePhase()
        }
    }

    private func typePhase() {
        let currentText = phases[currentPhase]
        displayedText = ""

        // Type out each character
        for (index, character) in currentText.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * 0.04) {
                displayedText += String(character)
            }
        }

        // Wait, then move to next phase
        let typingDuration = Double(currentText.count) * 0.04 + 1.5
        DispatchQueue.main.asyncAfter(deadline: .now() + typingDuration) {
            currentPhase = (currentPhase + 1) % phases.count
            typePhase()
        }
    }
}

// MARK: - In-Place Transformation Animation

/// Animation for transforming the original prompt into the enhanced prompt in place
struct PromptTransformAnimation: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var isAnimating: Bool
    let originalText: String
    @Binding var transformedText: String

    @State private var shimmerOffset: CGFloat = -1.0
    @State private var glowPulse: CGFloat = 0.0
    @State private var textOpacity: Double = 1.0

    var body: some View {
        ZStack {
            // Glow background during transformation
            if isAnimating {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.brandCyan.opacity(0.1 * glowPulse))
                    .blur(radius: 20)
            }

            // Text content
            VStack(alignment: .leading, spacing: 0) {
                Text(transformedText.isEmpty ? originalText : transformedText)
                    .font(.system(.body, design: .default))
                    .foregroundStyle(Color.adaptiveTextPrimary)
                    .opacity(textOpacity)
                    .overlay {
                        if isAnimating {
                            // Shimmer effect
                            GeometryReader { geometry in
                                LinearGradient(
                                    colors: [
                                        Color.clear,
                                        Color.brandCyan.opacity(0.4),
                                        Color.clear
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                                .frame(width: geometry.size.width * 0.3)
                                .offset(x: shimmerOffset * geometry.size.width)
                                .blur(radius: 3)
                            }
                            .mask(
                                Text(transformedText.isEmpty ? originalText : transformedText)
                                    .font(.system(.body, design: .default))
                            )
                        }
                    }
            }
        }
        .onChange(of: isAnimating) { _, newValue in
            if newValue {
                startAnimation()
            } else {
                stopAnimation()
            }
        }
    }

    private func startAnimation() {
        // Shimmer animation
        withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
            shimmerOffset = 1.5
        }

        // Glow pulse
        withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
            glowPulse = 1.0
        }
    }

    private func stopAnimation() {
        shimmerOffset = -1.0
        glowPulse = 0.0
    }
}

// MARK: - Liquid Glass Card (Legacy - use .liquidGlass() modifier instead)

struct LiquidGlassCard<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    let content: Content
    var cornerRadius: CGFloat = 20
    var padding: CGFloat = 20

    init(cornerRadius: CGFloat = 20, padding: CGFloat = 20, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.cornerRadius = cornerRadius
        self.padding = padding
    }

    private var specularGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.brandCyan.opacity(0.15), Color.white.opacity(0.05), Color.clear]
                : [Color.white.opacity(0.9), Color.brandPurple.opacity(0.1), Color.clear],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.brandCyan.opacity(0.35), Color.white.opacity(0.1), Color.brandCyan.opacity(0.15)]
                : [Color.white.opacity(0.95), Color.brandPurple.opacity(0.2), Color.white.opacity(0.6)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var body: some View {
        content
            .padding(padding)
            .background {
                ZStack {
                    // Base material layer
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    // Tinted overlay for depth
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            colorScheme == .dark
                                ? Color.brandPurpleLight.opacity(0.1)
                                : Color.brandPurple.opacity(0.03)
                        )

                    // Specular highlight
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(specularGradient)
                        .opacity(0.5)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(borderGradient, lineWidth: 1)
            }
            .shadow(
                color: colorScheme == .dark
                    ? Color.black.opacity(0.4)
                    : Color.brandPurple.opacity(0.1),
                radius: 16,
                y: 8
            )
            .shadow(
                color: colorScheme == .dark
                    ? Color.black.opacity(0.2)
                    : Color.brandPurple.opacity(0.05),
                radius: 4,
                y: 2
            )
    }
}

// MARK: - Shimmer Effect

struct ShimmerEffect: ViewModifier {
    @State private var phase: CGFloat = 0
    var duration: Double = 1.5

    func body(content: Content) -> some View {
        content
            .overlay {
                GeometryReader { geometry in
                    LinearGradient(
                        colors: [
                            Color.brandCyan.opacity(0),
                            Color.brandCyan.opacity(0.5),
                            Color.brandCyan.opacity(0)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geometry.size.width * 0.5)
                    .offset(x: phase * geometry.size.width * 1.5 - geometry.size.width * 0.25)
                    .mask(content)
                }
            }
            .onAppear {
                withAnimation(.linear(duration: duration).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
    }
}

extension View {
    func shimmer(duration: Double = 1.5) -> some View {
        modifier(ShimmerEffect(duration: duration))
    }
}

// MARK: - Bounce Button Style

struct BounceButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - Elastic Button Style

struct ElasticButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.5, blendDuration: 0), value: configuration.isPressed)
    }
}

// MARK: - Glow Effect

struct GlowEffect: ViewModifier {
    let color: Color
    let radius: CGFloat
    @State private var isGlowing = false

    func body(content: Content) -> some View {
        content
            .shadow(color: color.opacity(isGlowing ? 0.6 : 0.3), radius: isGlowing ? radius : radius * 0.5)
            .onAppear {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    isGlowing = true
                }
            }
    }
}

extension View {
    func pulsingGlow(color: Color = Color.brandCyan, radius: CGFloat = 15) -> some View {
        modifier(GlowEffect(color: color, radius: radius))
    }
}

// MARK: - Typing Text Animation

struct TypingText: View {
    let fullText: String
    let speed: Double

    @State private var displayedText = ""
    @State private var currentIndex = 0

    init(_ text: String, speed: Double = 0.03) {
        self.fullText = text
        self.speed = speed
    }

    var body: some View {
        Text(displayedText)
            .onAppear {
                animateText()
            }
    }

    private func animateText() {
        displayedText = ""
        currentIndex = 0

        Timer.scheduledTimer(withTimeInterval: speed, repeats: true) { timer in
            if currentIndex < fullText.count {
                let index = fullText.index(fullText.startIndex, offsetBy: currentIndex)
                displayedText += String(fullText[index])
                currentIndex += 1
            } else {
                timer.invalidate()
            }
        }
    }
}

// MARK: - Success Checkmark Animation

struct SuccessCheckmark: View {
    @State private var drawProgress: CGFloat = 0
    @State private var scale: CGFloat = 0.8
    @State private var opacity: Double = 0

    let size: CGFloat
    let color: Color

    init(size: CGFloat = 60, color: Color = Color.brandCyan) {
        self.size = size
        self.color = color
    }

    var body: some View {
        ZStack {
            // Background circle
            Circle()
                .fill(color.opacity(0.15))
                .frame(width: size, height: size)

            // Checkmark
            Path { path in
                path.move(to: CGPoint(x: size * 0.25, y: size * 0.5))
                path.addLine(to: CGPoint(x: size * 0.42, y: size * 0.65))
                path.addLine(to: CGPoint(x: size * 0.75, y: size * 0.35))
            }
            .trim(from: 0, to: drawProgress)
            .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
        }
        .scaleEffect(scale)
        .opacity(opacity)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                scale = 1.0
                opacity = 1.0
            }
            withAnimation(.easeOut(duration: 0.4).delay(0.2)) {
                drawProgress = 1.0
            }
        }
    }
}

// MARK: - Floating Particles

struct FloatingParticles: View {
    let count: Int
    let color: Color

    @State private var particles: [Particle] = []

    struct Particle: Identifiable {
        let id = UUID()
        var x: CGFloat
        var y: CGFloat
        var size: CGFloat
        var opacity: Double
    }

    init(count: Int = 15, color: Color = Color.brandCyan) {
        self.count = count
        self.color = color
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(particles) { particle in
                    Circle()
                        .fill(color)
                        .frame(width: particle.size, height: particle.size)
                        .position(x: particle.x, y: particle.y)
                        .opacity(particle.opacity)
                }
            }
            .onAppear {
                createParticles(in: geometry.size)
                animateParticles(in: geometry.size)
            }
        }
    }

    private func createParticles(in size: CGSize) {
        particles = (0..<count).map { _ in
            Particle(
                x: CGFloat.random(in: 0...size.width),
                y: CGFloat.random(in: 0...size.height),
                size: CGFloat.random(in: 2...6),
                opacity: Double.random(in: 0.1...0.4)
            )
        }
    }

    private func animateParticles(in size: CGSize) {
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            for i in particles.indices {
                withAnimation(.linear(duration: 0.05)) {
                    particles[i].y -= 0.5
                    particles[i].x += CGFloat.random(in: -0.5...0.5)

                    if particles[i].y < 0 {
                        particles[i].y = size.height
                        particles[i].x = CGFloat.random(in: 0...size.width)
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview("Logo Enhancement Animation") {
    LogoEnhancementAnimation()
        .padding(50)
        .background(Color.brandPurple)
}

#Preview("AI Orb") {
    AIOrb()
        .padding(50)
        .background(Color.brandPurple)
}

#Preview("Enhancement Loader") {
    PromptEnhancementLoader()
        .padding(50)
        .background(Color.brandPurple)
}

#Preview("Enhancement Loader - Light") {
    PromptEnhancementLoader()
        .padding(50)
        .background(Color.white)
        .environment(\.colorScheme, .light)
}

#Preview("Liquid Glass Card") {
    LiquidGlassCard {
        VStack {
            Text("Liquid Glass")
                .font(.headline)
                .foregroundStyle(Color.adaptiveTextPrimary)
            Text("Beautiful translucent effect")
                .font(.caption)
                .foregroundStyle(Color.adaptiveTextSecondary)
        }
    }
    .padding()
    .background(
        LinearGradient(colors: [Color.brandPurple, Color.brandPurpleDark], startPoint: .topLeading, endPoint: .bottomTrailing)
    )
}
