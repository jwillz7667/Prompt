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
    var isAuthenticated: Bool { currentUser != nil || hasStoredSession }
    var isLoading = false
    var isCheckingSession = true
    var error: AuthError?

    // MARK: - Persistent Session Storage

    private let hasSignedInKey = "com.promptomize.hasSignedIn"
    private let cachedUserKey = "com.promptomize.cachedUser"

    /// Check if user has ever signed in (survives app restarts)
    private var hasStoredSession: Bool {
        UserDefaults.standard.bool(forKey: hasSignedInKey)
    }

    /// Store that user has signed in
    private func markAsSignedIn() {
        UserDefaults.standard.set(true, forKey: hasSignedInKey)
    }

    /// Clear sign-in state (only on explicit sign out)
    private func clearSignedInState() {
        UserDefaults.standard.removeObject(forKey: hasSignedInKey)
        UserDefaults.standard.removeObject(forKey: cachedUserKey)
    }

    /// Cache user data locally
    private func cacheUser(_ user: User) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: cachedUserKey)
        }
    }

    /// Load cached user data
    private func loadCachedUser() -> User? {
        guard let data = UserDefaults.standard.data(forKey: cachedUserKey),
              let user = try? JSONDecoder().decode(User.self, from: data) else {
            return nil
        }
        return user
    }

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

        // Load stored tokens from keychain
        await APIClient.shared.loadStoredTokens()

        // Check if we have tokens
        let hasTokens = await APIClient.shared.isAuthenticated

        // If we have tokens, try to validate with backend
        if hasTokens {
            do {
                let response: MeResponse = try await APIClient.shared.request("/auth/me")
                self.currentUser = User(from: response.user)
                cacheUser(self.currentUser!)
                markAsSignedIn()
                print("[Auth] Session restored from server")
                return
            } catch let error as APIError {
                // Only clear tokens on explicit auth failures (401)
                if case .unauthorized = error {
                    print("[Auth] Token invalid (401), clearing session")
                    await APIClient.shared.clearTokens()
                    // Don't clear UserDefaults - let user stay "logged in" with cached data
                } else {
                    // Network or other transient error - use cached user
                    ErrorHandler.shared.handleSilently(error, context: "checkExistingSession")
                    if let cached = loadCachedUser() {
                        self.currentUser = cached
                        print("[Auth] Using cached user data")
                        return
                    }
                }
            } catch {
                // Network error - use cached data if available
                ErrorHandler.shared.handleSilently(error, context: "checkExistingSession")
                if let cached = loadCachedUser() {
                    self.currentUser = cached
                    print("[Auth] Using cached user data")
                    return
                }
            }
        }

        // No tokens but user has signed in before - restore from cache
        if hasStoredSession {
            if let cached = loadCachedUser() {
                self.currentUser = cached
                print("[Auth] Session restored from cache (no tokens)")
                return
            }
            // Has signed in before but no cache - create minimal user
            print("[Auth] User previously signed in, allowing access")
            // The user will need to re-auth if they try to use API features
        }
    }

    // MARK: - Apple Sign In

    func handleAppleSignIn(authorization: ASAuthorization) async {
        print("[Auth] handleAppleSignIn called")
        isLoading = true
        error = nil

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let identityTokenData = credential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8),
              let authCodeData = credential.authorizationCode,
              let authCode = String(data: authCodeData, encoding: .utf8) else {
            print("[Auth] Failed to extract credentials")
            error = .invalidCredential
            isLoading = false
            return
        }

        print("[Auth] Credentials extracted, calling backend...")

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

            print("[Auth] Backend response received, setting tokens...")

            await APIClient.shared.setTokens(
                access: response.accessToken,
                refresh: response.refreshToken
            )

            currentUser = User(from: response.user)
            cacheUser(currentUser!)
            markAsSignedIn()
            print("[Auth] User set: \(response.user.email), isAuthenticated: \(isAuthenticated)")

            // Sync subscription status after successful authentication
            await StoreKitManager.shared.syncWithBackend()

            // Track successful sign-in
            AnalyticsService.shared.trackSignIn(provider: "apple", success: true)
        } catch {
            ErrorHandler.shared.handle(error, context: "handleAppleSignIn")
            AnalyticsService.shared.trackSignIn(provider: "apple", success: false, error: error)
            self.error = .serverError(error.localizedDescription)
        }

        isLoading = false
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
        clearSignedInState()
        currentUser = nil
        isLoading = false
    }

    // MARK: - Sign Out All Devices

    func signOutAllDevices() async throws {
        try await APIClient.shared.requestVoid("/auth/logout-all", method: .post)
        await APIClient.shared.clearTokens()
        clearSignedInState()
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

            print("[Auth] Apple Sign In delegate called")

            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let identityTokenData = credential.identityToken,
                  let identityToken = String(data: identityTokenData, encoding: .utf8),
                  let authCodeData = credential.authorizationCode,
                  let authCode = String(data: authCodeData, encoding: .utf8) else {
                print("[Auth] Failed to extract credentials")
                error = .invalidCredential
                return
            }

            print("[Auth] Credentials extracted, calling backend...")

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

                print("[Auth] Backend response received, setting tokens...")

                await APIClient.shared.setTokens(
                    access: response.accessToken,
                    refresh: response.refreshToken
                )

                currentUser = User(from: response.user)
                cacheUser(currentUser!)
                markAsSignedIn()
                print("[Auth] User set: \(response.user.email), isAuthenticated: \(isAuthenticated)")

                // Sync subscription status after successful authentication
                await StoreKitManager.shared.syncWithBackend()

                // Track successful sign-in
                AnalyticsService.shared.trackSignIn(provider: "apple", success: true)
            } catch {
                ErrorHandler.shared.handle(error, context: "authorizationController")
                AnalyticsService.shared.trackSignIn(provider: "apple", success: false, error: error)
                self.error = .serverError(error.localizedDescription)
            }
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        print("[Auth] Error delegate called: \(error)")
        // Track the auth error
        Task { @MainActor in
            ErrorHandler.shared.handleSilently(error, context: "authorizationController")
        }

        Task { @MainActor in
            isLoading = false

            if let authError = error as? ASAuthorizationError {
                print("[Auth] ASAuthorizationError code: \(authError.code.rawValue)")
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
