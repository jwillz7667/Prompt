//
//  AuthView.swift
//  Prompt
//
//  Sign in screen with Apple and Google authentication
//  Brand Colors: Purple (#512AD4) and Cyan (#00FFF9)
//  AAA WCAG Compliant Colors
//

import SwiftUI
import AuthenticationServices

struct AuthView: View {
    enum Mode {
        case standard
        case guestUnlock
    }

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var authManager

    let mode: Mode
    var onAuthenticated: (() -> Void)? = nil

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        ZStack {
            // Liquid Glass animated background
            LiquidGlassBackground()

            VStack(spacing: 40) {
                Spacer()

                VStack(spacing: 20) {
                    AppBrandMark(size: 124, showsGlassBackdrop: true)

                    VStack(spacing: 10) {
                        Text(title)
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundStyle(textPrimary)
                            .multilineTextAlignment(.center)

                        Text(subtitle)
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .foregroundStyle(textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }
                }

                if mode == .guestUnlock {
                    VStack(alignment: .leading, spacing: 12) {
                        benefitRow(systemImage: "checkmark.circle.fill", text: "Keep the chat going without losing your progress")
                        benefitRow(systemImage: "flame.fill", text: "Claim your 7-day Premium trial right after sign-in")
                        benefitRow(systemImage: "lock.shield.fill", text: "Secure your threads, history, and premium tools")
                    }
                    .padding(18)
                    .liquidGlass(cornerRadius: 24, shadowIntensity: 0.64, borderGlow: true)
                    .padding(.horizontal, 28)
                }

                Spacer()

                // Sign in buttons
                VStack(spacing: 16) {
                    // Apple Sign In
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        switch result {
                        case .success(let authorization):
                            Task {
                                await authManager.handleAppleSignIn(authorization: authorization)
                                if authManager.error == nil {
                                    onAuthenticated?()
                                    dismiss()
                                }
                            }
                        case .failure(let error):
                            print("[Auth] Apple Sign In failed: \(error)")
                        }
                    }
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                    // Loading indicator
                    if authManager.isLoading {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(textPrimary)
                            .padding()
                    }

                    // Error message
                    if let error = authManager.error {
                        Text(error.localizedDescription)
                            .font(.caption)
                            .foregroundStyle(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .padding(.horizontal, 32)

                // Terms and privacy
                VStack(spacing: 8) {
                    Text("By continuing, you agree to our")
                        .font(.caption)
                        .foregroundStyle(textSecondary)

                    HStack(spacing: 4) {
                        Link("Terms of Service", destination: URL(string: "https://promptomize.app/terms")!)
                        Text("and")
                            .foregroundStyle(textSecondary)
                        Link("Privacy Policy", destination: URL(string: "https://promptomize.app/privacy")!)
                    }
                    .font(.caption)
                }
                .padding(.bottom, 40)
            }
        }
    }

    private var title: String {
        switch mode {
        case .standard:
            return "Promptomize"
        case .guestUnlock:
            return "Keep optimizing"
        }
    }

    private var subtitle: String {
        switch mode {
        case .standard:
            return "Transform your prompts with AI-powered enhancement"
        case .guestUnlock:
            return "You’ve used your guest prompts. Sign in to continue and unlock the Premium trial offer."
        }
    }

    private func benefitRow(systemImage: String, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(accentColor)
                .frame(width: 20)

            Text(text)
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    AuthView(mode: .guestUnlock)
        .environment(AuthManager.shared)
}
