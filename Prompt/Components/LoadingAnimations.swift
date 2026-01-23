//
//  LoadingAnimations.swift
//  Prompt
//
//  Custom loading animations and micro-interactions for iOS 26
//

import SwiftUI

// MARK: - AI Orb Loading Animation

struct AIOrb: View {
    @State private var rotation1: Double = 0
    @State private var rotation2: Double = 0
    @State private var rotation3: Double = 0
    @State private var pulse: CGFloat = 1.0
    @State private var glowIntensity: Double = 0.4

    let size: CGFloat
    let primaryColor: Color
    let accentColor: Color

    init(size: CGFloat = 120, primaryColor: Color = .primary, accentColor: Color = .blue) {
        self.size = size
        self.primaryColor = primaryColor
        self.accentColor = accentColor
    }

    var body: some View {
        ZStack {
            // Outer glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [accentColor.opacity(glowIntensity), Color.clear],
                        center: .center,
                        startRadius: size * 0.2,
                        endRadius: size * 0.7
                    )
                )
                .frame(width: size * 1.4, height: size * 1.4)
                .blur(radius: 25)

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

            // Core sphere with gradient
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            accentColor.opacity(0.95),
                            accentColor.opacity(0.7),
                            primaryColor.opacity(0.4)
                        ],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: size * 0.25
                    )
                )
                .frame(width: size * 0.4, height: size * 0.4)
                .scaleEffect(pulse)
                .shadow(color: accentColor.opacity(0.6), radius: 20)

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
                glowIntensity = 0.5
            }
        }
    }
}

// MARK: - Waveform Visualizer

struct WaveformVisualizer: View {
    @State private var amplitudes: [CGFloat] = Array(repeating: 0.3, count: 5)
    let color: Color

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

// MARK: - Prompt Enhancement Loader

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
    private var accentColor: Color {
        colorScheme == .dark ? Color.blue.opacity(0.8) : Color.blue
    }

    var body: some View {
        VStack(spacing: 32) {
            // Main orb animation
            AIOrb(
                size: 140,
                primaryColor: primaryColor,
                accentColor: accentColor
            )

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
                WaveformVisualizer(color: secondaryColor.opacity(0.6))
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
                ? [Color.white.opacity(0.2), Color.white.opacity(0.05), Color.clear]
                : [Color.white.opacity(0.9), Color.white.opacity(0.3), Color.clear],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.white.opacity(0.35), Color.white.opacity(0.1), Color.white.opacity(0.15)]
                : [Color.white.opacity(0.95), Color.white.opacity(0.4), Color.white.opacity(0.6)],
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
                                ? Color.white.opacity(0.03)
                                : Color.white.opacity(0.5)
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
                color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.1),
                radius: 16,
                y: 8
            )
            .shadow(
                color: Color.black.opacity(colorScheme == .dark ? 0.2 : 0.05),
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
                            Color.white.opacity(0),
                            Color.white.opacity(0.5),
                            Color.white.opacity(0)
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
    func pulsingGlow(color: Color = Color(white: 0.3), radius: CGFloat = 15) -> some View {
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

    init(size: CGFloat = 60, color: Color = .green) {
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

#Preview("AI Orb") {
    AIOrb()
        .padding(50)
        .background(Color(white: 0.95))
}

#Preview("AI Orb - Dark") {
    AIOrb(primaryColor: .white, accentColor: .cyan)
        .padding(50)
        .background(Color(white: 0.1))
}

#Preview("Enhancement Loader") {
    PromptEnhancementLoader()
        .padding(50)
        .background(Color(white: 0.95))
}

#Preview("Enhancement Loader - Dark") {
    PromptEnhancementLoader()
        .padding(50)
        .background(Color(white: 0.1))
        .environment(\.colorScheme, .dark)
}

#Preview("Liquid Glass Card") {
    LiquidGlassCard {
        VStack {
            Text("Liquid Glass")
                .font(.headline)
            Text("Beautiful translucent effect")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
    .padding()
    .background(
        LinearGradient(colors: [.blue.opacity(0.3), .purple.opacity(0.3)], startPoint: .topLeading, endPoint: .bottomTrailing)
    )
}
