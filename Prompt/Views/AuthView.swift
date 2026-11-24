//
//  AuthView.swift
//  Prompt
//
//  Required Sign in with Apple screen shown before the app (RootView).
//  An account is required because chats, history and the subscription are
//  stored on it and sync across devices.
//  Brand Colors: Purple (#512AD4) and Cyan (#00FFF9)
//  AAA WCAG Compliant Colors
//

import SwiftUI
import AuthenticationServices

struct AuthView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { Color.brandCyan }

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 18) {
                    heroCard
                    benefitsCard
                    signInCard
                    termsFooter
                }
                .frame(maxWidth: 560)
                .padding(.horizontal, 20)
                .padding(.top, 32)
                .padding(.bottom, 32)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var heroCard: some View {
        VStack(spacing: 18) {
            AppBrandMark(size: 96, showsGlassBackdrop: true)

            VStack(spacing: 10) {
                Text("Welcome to Promptomize")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(textPrimary)
                    .multilineTextAlignment(.center)

                Text("Turn rough ideas into sharp prompts and get answers from an AI assistant.")
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 28)
        .liquidGlass(cornerRadius: 28, shadowIntensity: 0.74, borderGlow: true)
    }

    private var benefitsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            benefitRow(systemImage: "wand.and.stars", text: "Prompt optimizer for text, images, video, music, code and more")
            benefitRow(systemImage: "bubble.left.and.text.bubble.right", text: "AI chat assistant for questions, drafts and brainstorming")
            benefitRow(systemImage: "icloud", text: "Your chats and history are saved to your account and sync across devices")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 24, shadowIntensity: 0.7, borderGlow: true)
    }

    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Sign in to continue")
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)

            Text("An account keeps your chats, history and subscription in one place.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            SignInWithAppleButton(.signIn) { request in
                authManager.prepareAppleSignIn(request)
            } onCompletion: { result in
                switch result {
                case .success(let authorization):
                    Task { await authManager.handleAppleSignIn(authorization: authorization) }
                case .failure(let error):
                    authManager.handleAppleSignInFailure(error)
                }
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: 56)
            .disabled(authManager.isLoading)
            .accessibilityIdentifier("auth.apple.signIn")
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            if authManager.isLoading {
                HStack(spacing: 10) {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(accentColor)

                    Text("Signing you in...")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(textSecondary)
                }
            }

            if let error = authManager.error {
                Text(error.localizedDescription)
                    .accessibilityIdentifier("auth.error")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(colorScheme == .dark ? Color(red: 255/255, green: 69/255, blue: 58/255) : Color(red: 0.85, green: 0.2, blue: 0.25))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 24, shadowIntensity: 0.7)
    }

    private var termsFooter: some View {
        VStack(spacing: 8) {
            Text("By continuing, you agree to our")
                .font(.caption)
                .foregroundStyle(textSecondary)

            HStack(spacing: 4) {
                Link("Terms of Use", destination: LegalLinks.termsOfUse)
                Text("and")
                    .foregroundStyle(textSecondary)
                Link("Privacy Policy", destination: LegalLinks.privacyPolicy)
            }
            .font(.caption)
        }
        .padding(.top, 4)
        .padding(.bottom, 12)
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
    AuthView()
        .environment(AuthManager.shared)
}
