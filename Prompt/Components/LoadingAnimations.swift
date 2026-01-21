//
//  LoadingAnimations.swift
//  Prompt
//
//  Custom loading animations and micro-interactions for iOS 26
//

import SwiftUI

// MARK: - Neural Network Loading Animation

struct NeuralNetworkLoader: View {
    @State private var rotation: Double = 0
    @State private var scale: CGFloat = 1.0
    @State private var nodeOpacities: [Double] = Array(repeating: 0.3, count: 6)
    @State private var connectionOpacities: [Double] = Array(repeating: 0.2, count: 8)

    let size: CGFloat
    let primaryColor: Color
    let secondaryColor: Color

    init(size: CGFloat = 80, primaryColor: Color = Color(white: 0.25), secondaryColor: Color = Color(white: 0.5)) {
        self.size = size
        self.primaryColor = primaryColor
        self.secondaryColor = secondaryColor
    }

    var body: some View {
        ZStack {
            // Outer rotating ring
            Circle()
                .stroke(
                    AngularGradient(
                        colors: [primaryColor.opacity(0.1), primaryColor.opacity(0.8), primaryColor.opacity(0.1)],
                        center: .center
                    ),
                    lineWidth: 3
                )
                .frame(width: size, height: size)
                .rotationEffect(.degrees(rotation))

            // Inner pulsing core
            Circle()
                .fill(
                    RadialGradient(
                        colors: [primaryColor.opacity(0.6), primaryColor.opacity(0.1)],
                        center: .center,
                        startRadius: 0,
                        endRadius: size * 0.3
                    )
                )
                .frame(width: size * 0.5, height: size * 0.5)
                .scaleEffect(scale)

            // Neural nodes
            ForEach(0..<6, id: \.self) { index in
                Circle()
                    .fill(primaryColor)
                    .frame(width: 8, height: 8)
                    .opacity(nodeOpacities[index])
                    .offset(y: -size * 0.35)
                    .rotationEffect(.degrees(Double(index) * 60))
            }

            // Center sparkle
            Image(systemName: "sparkle")
                .font(.system(size: size * 0.25, weight: .light))
                .foregroundStyle(primaryColor)
                .opacity(scale > 1.05 ? 1 : 0.5)
        }
        .onAppear {
            // Continuous rotation
            withAnimation(.linear(duration: 2).repeatForever(autoreverses: false)) {
                rotation = 360
            }

            // Pulsing core
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                scale = 1.15
            }

            // Animate nodes sequentially
            for index in 0..<6 {
                withAnimation(
                    .easeInOut(duration: 0.5)
                    .repeatForever(autoreverses: true)
                    .delay(Double(index) * 0.1)
                ) {
                    nodeOpacities[index] = 1.0
                }
            }
        }
    }
}

// MARK: - Prompt Enhancement Loader

struct PromptEnhancementLoader: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var currentPhase = 0
    @State private var progress: CGFloat = 0
    @State private var textOpacity: Double = 1
    @State private var waveOffset: CGFloat = 0

    let phases = ["Analyzing prompt...", "Applying AI magic...", "Enhancing clarity...", "Optimizing structure..."]

    // AAA Compliant Colors
    private var primaryColor: Color { Color.adaptiveTextPrimary }
    private var secondaryColor: Color { Color.adaptiveTextSecondary }

    var body: some View {
        VStack(spacing: 24) {
            // Main loader
            ZStack {
                // Background glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [primaryColor.opacity(0.2), Color.clear],
                            center: .center,
                            startRadius: 20,
                            endRadius: 80
                        )
                    )
                    .frame(width: 160, height: 160)
                    .blur(radius: 20)

                // Neural network animation
                NeuralNetworkLoader(size: 100, primaryColor: primaryColor, secondaryColor: secondaryColor)

                // Progress ring
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        primaryColor,
                        style: StrokeStyle(lineWidth: 4, lineCap: .round)
                    )
                    .frame(width: 110, height: 110)
                    .rotationEffect(.degrees(-90))
            }

            // Phase text
            Text(phases[currentPhase])
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(secondaryColor)
                .opacity(textOpacity)
                .contentTransition(.numericText())
        }
        .onAppear {
            startAnimations()
        }
    }

    private func startAnimations() {
        // Progress animation
        withAnimation(.easeInOut(duration: 8)) {
            progress = 0.95
        }

        // Phase cycling
        Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { timer in
            withAnimation(.easeInOut(duration: 0.3)) {
                textOpacity = 0
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                currentPhase = (currentPhase + 1) % phases.count
                withAnimation(.easeInOut(duration: 0.3)) {
                    textOpacity = 1
                }
            }
        }
    }
}

// MARK: - Liquid Glass Card

struct LiquidGlassCard<Content: View>: View {
    let content: Content
    var cornerRadius: CGFloat = 20
    var padding: CGFloat = 20

    init(cornerRadius: CGFloat = 20, padding: CGFloat = 20, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.cornerRadius = cornerRadius
        self.padding = padding
    }

    var body: some View {
        content
            .padding(padding)
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .background {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(Color.white.opacity(0.7))
                    }
                    .shadow(color: Color.black.opacity(0.06), radius: 12, y: 4)
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.8),
                                        Color.white.opacity(0.2)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    }
            }
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

#Preview("Neural Network Loader") {
    NeuralNetworkLoader()
        .padding(50)
        .background(Color(white: 0.95))
}

#Preview("Enhancement Loader") {
    PromptEnhancementLoader()
        .padding(50)
        .background(Color(white: 0.95))
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
