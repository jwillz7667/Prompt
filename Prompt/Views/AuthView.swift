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
            LiquidGlassBackground()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 18) {
                    if mode == .standard {
                        HStack {
                            Spacer()

                            Button {
                                dismiss()
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(textPrimary)
                            }
                            .buttonStyle(GlassIconButtonStyle(size: 40))
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                    } else {
                        Color.clear
                            .frame(height: 20)
                    }

                    VStack(spacing: 18) {
                        heroCard

                        if mode == .guestUnlock {
                            unlockCard
                        }

                        signInCard

                        termsFooter
                    }
                    .frame(maxWidth: 560)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var heroCard: some View {
        VStack(spacing: 18) {
            AppBrandMark(size: 96, showsGlassBackdrop: true)

            VStack(spacing: 10) {
                Text(title)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(textPrimary)
                    .multilineTextAlignment(.center)

                Text(subtitle)
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

    private var unlockCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(accentColor)

                Text("What you unlock after sign-in")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(textPrimary)
            }

            VStack(alignment: .leading, spacing: 12) {
                benefitRow(systemImage: "checkmark.circle.fill", text: "Keep this chat and continue refining without losing your work")
                benefitRow(systemImage: "flame.fill", text: "Claim the 7-day Premium trial right after sign-in")
                benefitRow(systemImage: "lock.shield.fill", text: "Save your history, sync your account, and unlock paid tools")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .liquidGlass(cornerRadius: 24, shadowIntensity: 0.7, borderGlow: true)
    }

    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(mode == .guestUnlock ? "Continue with Apple" : "Sign in with Apple")
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(textPrimary)

            Text(mode == .guestUnlock ? "Sign in to keep this workflow moving and unlock the Premium offer." : "Use your Apple account to sync prompts, history, and plan access.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .fixedSize(horizontal: false, vertical: true)

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
            .frame(height: 56)
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
                Link("Terms of Service", destination: URL(string: "https://promptomize.app/terms")!)
                Text("and")
                    .foregroundStyle(textSecondary)
                Link("Privacy Policy", destination: URL(string: "https://promptomize.app/privacy")!)
            }
            .font(.caption)
        }
        .padding(.top, 4)
        .padding(.bottom, 12)
    }

    private var title: String {
        switch mode {
        case .standard:
            return "Promptomize"
        case .guestUnlock:
            return "Keep the workflow moving"
        }
    }

    private var subtitle: String {
        switch mode {
        case .standard:
            return "Upgrade weak prompts into production-ready instructions with a cleaner, faster chat workflow."
        case .guestUnlock:
            return "Your guest prompts are used up. Sign in to keep this thread, save your work, and unlock the Premium trial offer."
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
