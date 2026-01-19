//
//  AuthView.swift
//  Prompt
//
//  Sign in screen with Apple and Google authentication
//

import SwiftUI
import AuthenticationServices

struct AuthView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(uiColor: .systemBackground),
                    Color.blue.opacity(0.1),
                    Color.purple.opacity(0.1)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                // Logo and title
                VStack(spacing: 20) {
                    Image(systemName: "wand.and.stars")
                        .font(.system(size: 80, weight: .light))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.blue, .purple],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    Text("Prompt Enhancer")
                        .font(.system(size: 32, weight: .bold, design: .rounded))

                    Text("Transform your prompts with AI-powered enhancement")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                Spacer()

                // Sign in buttons
                VStack(spacing: 16) {
                    // Apple Sign In
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { _ in
                        // Handled by AuthManager delegate
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color(uiColor: .separator), lineWidth: 0.5)
                    )
                    .onTapGesture {
                        authManager.signInWithApple()
                    }

                    // Google Sign In (placeholder)
                    Button {
                        // Google sign in - requires SDK
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "g.circle.fill")
                                .font(.title2)
                            Text("Sign in with Google")
                                .font(.system(.body, weight: .medium))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Color(uiColor: .systemBackground))
                        .foregroundStyle(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(Color(uiColor: .separator), lineWidth: 1)
                        )
                    }
                }
                .padding(.horizontal, 24)
                .disabled(authManager.isLoading)

                // Loading indicator
                if authManager.isLoading {
                    ProgressView()
                        .scaleEffect(1.2)
                }

                // Error message
                if let error = authManager.error {
                    Text(error.localizedDescription)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Spacer()

                // Terms and privacy
                VStack(spacing: 8) {
                    Text("By signing in, you agree to our")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 4) {
                        Link("Terms of Service", destination: URL(string: "https://example.com/terms")!)
                        Text("and")
                            .foregroundStyle(.secondary)
                        Link("Privacy Policy", destination: URL(string: "https://example.com/privacy")!)
                    }
                    .font(.caption)
                }
                .padding(.bottom, 32)
            }
        }
    }
}

#Preview {
    AuthView()
        .environment(AuthManager.shared)
}
