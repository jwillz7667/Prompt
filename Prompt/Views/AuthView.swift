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
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager

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

                // Logo and title
                VStack(spacing: 20) {
                    // App Logo - Add your logo.png to Assets.xcassets
                    Group {
                        if UIImage(named: "AppLogo") != nil {
                            Image("AppLogo")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 120, height: 120)
                        } else {
                            Image(systemName: "wand.and.stars")
                                .font(.system(size: 80, weight: .light))
                                .foregroundStyle(textPrimary)
                        }
                    }

                    Text("Promptomize")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(textPrimary)

                    Text("Transform your prompts with AI-powered enhancement")
                        .font(.subheadline)
                        .foregroundStyle(textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
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
}

#Preview {
    AuthView()
        .environment(AuthManager.shared)
}
