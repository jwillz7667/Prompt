//
//  AuthManager.swift
//  Prompt
//
//  Enterprise authentication manager supporting Apple Sign In and Google OAuth
//

import Foundation
import AuthenticationServices
import SwiftUI

@Observable
@MainActor
final class AuthManager: NSObject {
    // MARK: - State

    var currentUser: User?
    var isAuthenticated: Bool { currentUser != nil }
    var isLoading = false
    var isCheckingSession = true
    var error: AuthError?

    // MARK: - Singleton

    static let shared = AuthManager()

    private override init() {
        super.init()
        Task {
            await checkExistingSession()
        }
    }

    // MARK: - Session Check

    func checkExistingSession() async {
        isCheckingSession = true
        defer { isCheckingSession = false }

        await APIClient.shared.loadStoredTokens()

        guard await APIClient.shared.isAuthenticated else { return }

        do {
            let response: MeResponse = try await APIClient.shared.request("/auth/me")
            self.currentUser = User(from: response.user)
        } catch {
            // Token invalid, clear it
            await APIClient.shared.clearTokens()
        }
    }

    // MARK: - Apple Sign In

    func signInWithApple() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()

        isLoading = true
        error = nil
    }

    // MARK: - Google Sign In

    func signInWithGoogle(presenting viewController: UIViewController) async {
        // Note: Implement using GoogleSignIn SDK
        // This is a placeholder - requires GoogleSignIn-iOS package
        isLoading = true
        error = nil

        // For now, show not implemented
        isLoading = false
        error = .notImplemented("Google Sign In requires GoogleSignIn SDK integration")
    }

    // MARK: - Sign Out

    func signOut() async {
        isLoading = true

        do {
            try await APIClient.shared.requestVoid("/auth/logout", method: .post)
        } catch {
            // Continue with local logout even if server call fails
            print("Logout API error: \(error)")
        }

        await APIClient.shared.clearTokens()
        currentUser = nil
        isLoading = false
    }

    // MARK: - Sign Out All Devices

    func signOutAllDevices() async throws {
        try await APIClient.shared.requestVoid("/auth/logout-all", method: .post)
        await APIClient.shared.clearTokens()
        currentUser = nil
    }
}

// MARK: - Apple Sign In Delegate

extension AuthManager: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        Task { @MainActor in
            defer { isLoading = false }

            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let identityTokenData = credential.identityToken,
                  let identityToken = String(data: identityTokenData, encoding: .utf8),
                  let authCodeData = credential.authorizationCode,
                  let authCode = String(data: authCodeData, encoding: .utf8) else {
                error = .invalidCredential
                return
            }

            do {
                let request = AppleAuthRequest(
                    identityToken: identityToken,
                    authorizationCode: authCode,
                    fullName: credential.fullName.map {
                        FullName(givenName: $0.givenName, familyName: $0.familyName)
                    },
                    deviceId: UIDevice.current.identifierForVendor?.uuidString,
                    deviceName: UIDevice.current.name
                )

                let response: AuthResponse = try await APIClient.shared.request(
                    "/auth/apple",
                    method: .post,
                    body: request,
                    requiresAuth: false
                )

                await APIClient.shared.setTokens(
                    access: response.accessToken,
                    refresh: response.refreshToken
                )

                currentUser = User(from: response.user)

                // Sync subscription status after successful authentication
                await StoreKitManager.shared.syncWithBackend()
            } catch {
                self.error = .serverError(error.localizedDescription)
            }
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            isLoading = false

            if let authError = error as? ASAuthorizationError {
                switch authError.code {
                case .canceled:
                    self.error = nil // User canceled, not an error
                case .failed:
                    self.error = .failed
                case .invalidResponse:
                    self.error = .invalidResponse
                case .notHandled:
                    self.error = .notHandled
                case .unknown:
                    self.error = .unknown
                case .notInteractive:
                    self.error = .notInteractive
                case .matchedExcludedCredential:
                    self.error = .failed
                @unknown default:
                    self.error = .unknown
                }
            } else {
                self.error = .serverError(error.localizedDescription)
            }
        }
    }
}

// MARK: - Models

struct User: Codable, Identifiable, Sendable {
    let id: String
    let email: String
    var name: String?
    var avatarUrl: String?
    var isPremium: Bool

    nonisolated init(from dto: UserDTO) {
        self.id = dto.id
        self.email = dto.email
        self.name = dto.name
        self.avatarUrl = dto.avatarUrl
        self.isPremium = dto.isPremium
    }
}

struct MeResponse: Decodable, Sendable {
    let user: UserDTO
}

struct AppleAuthRequest: Encodable, Sendable {
    let identityToken: String
    let authorizationCode: String
    let fullName: FullName?
    let deviceId: String?
    let deviceName: String?
}

struct FullName: Encodable, Sendable {
    let givenName: String?
    let familyName: String?
}

// MARK: - Presentation Context Provider

extension AuthManager: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Get the first connected window scene's key window
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.first as? UIWindowScene
        let window = windowScene?.windows.first { $0.isKeyWindow }
        return window ?? ASPresentationAnchor()
    }
}

// MARK: - Auth Errors

enum AuthError: LocalizedError, Equatable {
    case invalidCredential
    case failed
    case invalidResponse
    case notHandled
    case notInteractive
    case unknown
    case serverError(String)
    case notImplemented(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredential: return "Invalid credentials received"
        case .failed: return "Authentication failed"
        case .invalidResponse: return "Invalid response from authentication"
        case .notHandled: return "Authentication request not handled"
        case .notInteractive: return "Interactive authentication required"
        case .unknown: return "An unknown error occurred"
        case .serverError(let msg): return msg
        case .notImplemented(let msg): return msg
        }
    }
}
