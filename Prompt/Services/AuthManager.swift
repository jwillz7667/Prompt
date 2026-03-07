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

    // MARK: - Persistent Session Storage (App Group for update persistence)

    private let appGroupId = "group.com.res.promptomizer"
    private let hasSignedInKey = "com.promptomize.hasSignedIn"
    private let cachedUserKey = "com.promptomize.cachedUser"

    /// App Group UserDefaults - persists across app updates
    private var appGroupDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    /// Check if user has ever signed in (survives app restarts and updates)
    private var hasStoredSession: Bool {
        // Check App Group first, fallback to standard for migration
        if let value = appGroupDefaults?.object(forKey: hasSignedInKey) as? Bool {
            return value
        }
        // Migrate from standard UserDefaults if exists
        if UserDefaults.standard.bool(forKey: hasSignedInKey) {
            migrateAuthDataToAppGroup()
            return appGroupDefaults?.bool(forKey: hasSignedInKey) ?? false
        }
        return false
    }

    /// Store that user has signed in
    private func markAsSignedIn() {
        appGroupDefaults?.set(true, forKey: hasSignedInKey)
        // Also update SharedDataManager
        SharedDataManager.shared.isAuthenticated = true
        if let user = currentUser {
            SharedDataManager.shared.updateAuthState(isAuthenticated: true, name: user.name, email: user.email)
        }
    }

    /// Clear sign-in state (only on explicit sign out)
    private func clearSignedInState() {
        appGroupDefaults?.removeObject(forKey: hasSignedInKey)
        appGroupDefaults?.removeObject(forKey: cachedUserKey)
        // Also clear from standard UserDefaults (migration cleanup)
        UserDefaults.standard.removeObject(forKey: hasSignedInKey)
        UserDefaults.standard.removeObject(forKey: cachedUserKey)
        // Update SharedDataManager
        SharedDataManager.shared.updateAuthState(isAuthenticated: false, name: nil, email: nil)
    }

    /// Cache user data locally in App Group
    func cacheUser(_ user: User) {
        if let data = try? JSONEncoder().encode(user) {
            appGroupDefaults?.set(data, forKey: cachedUserKey)
        }
        // Also update SharedDataManager for widgets/extensions
        SharedDataManager.shared.updateAuthState(isAuthenticated: true, name: user.name, email: user.email)
    }

    /// Load cached user data from App Group
    private func loadCachedUser() -> User? {
        // Try App Group first
        if let data = appGroupDefaults?.data(forKey: cachedUserKey),
           let user = try? JSONDecoder().decode(User.self, from: data) {
            return user
        }
        // Fallback to standard UserDefaults for migration
        if let data = UserDefaults.standard.data(forKey: cachedUserKey),
           let user = try? JSONDecoder().decode(User.self, from: data) {
            // Migrate to App Group
            cacheUser(user)
            UserDefaults.standard.removeObject(forKey: cachedUserKey)
            return user
        }
        return nil
    }

    /// Migrate auth data from standard UserDefaults to App Group
    private func migrateAuthDataToAppGroup() {
        #if DEBUG
        print("[Auth] Migrating auth data to App Group")
        #endif
        // Migrate hasSignedIn flag
        if UserDefaults.standard.bool(forKey: hasSignedInKey) {
            appGroupDefaults?.set(true, forKey: hasSignedInKey)
            UserDefaults.standard.removeObject(forKey: hasSignedInKey)
        }
        // Migrate cached user
        if let data = UserDefaults.standard.data(forKey: cachedUserKey) {
            appGroupDefaults?.set(data, forKey: cachedUserKey)
            UserDefaults.standard.removeObject(forKey: cachedUserKey)
        }
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
                #if DEBUG
                print("[Auth] Session restored from server")
                #endif
                return
            } catch let error as APIError {
                // Only clear tokens on explicit auth failures (401)
                if case .unauthorized = error {
                    #if DEBUG
                    print("[Auth] Token invalid (401), clearing session")
                    #endif
                    await APIClient.shared.clearTokens()
                    // Don't clear UserDefaults - let user stay "logged in" with cached data
                } else {
                    // Network or other transient error - use cached user
                    ErrorHandler.shared.handleSilently(error, context: "checkExistingSession")
                    if let cached = loadCachedUser() {
                        self.currentUser = cached
                        #if DEBUG
                        print("[Auth] Using cached user data")
                        #endif
                        return
                    }
                }
            } catch {
                // Network error - use cached data if available
                ErrorHandler.shared.handleSilently(error, context: "checkExistingSession")
                if let cached = loadCachedUser() {
                    self.currentUser = cached
                    #if DEBUG
                    print("[Auth] Using cached user data")
                    #endif
                    return
                }
            }
        }

        // No tokens but user has signed in before - restore from cache
        if hasStoredSession {
            if let cached = loadCachedUser() {
                self.currentUser = cached
                #if DEBUG
                print("[Auth] Session restored from cache (no tokens)")
                #endif
                return
            }
            // Has signed in before but no cache - create minimal user
            #if DEBUG
            print("[Auth] User previously signed in, allowing access")
            #endif
            // The user will need to re-auth if they try to use API features
        }
    }

    // MARK: - Apple Sign In

    func handleAppleSignIn(authorization: ASAuthorization) async {
        #if DEBUG
        print("[Auth] handleAppleSignIn called")
        #endif
        isLoading = true
        error = nil

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let identityTokenData = credential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8),
              let authCodeData = credential.authorizationCode,
              let authCode = String(data: authCodeData, encoding: .utf8) else {
            #if DEBUG
            print("[Auth] Failed to extract credentials")
            #endif
            error = .invalidCredential
            isLoading = false
            return
        }

        #if DEBUG
        print("[Auth] Credentials extracted, calling backend...")
        #endif

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

            #if DEBUG
            print("[Auth] Backend response received, setting tokens...")
            #endif

            await APIClient.shared.setTokens(
                access: response.accessToken,
                refresh: response.refreshToken
            )

            currentUser = User(from: response.user)
            cacheUser(currentUser!)
            markAsSignedIn()
            #if DEBUG
            print("[Auth] User set: \(response.user.email), isAuthenticated: \(isAuthenticated)")
            #endif

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
            #if DEBUG
            print("Logout API error: \(error)")
            #endif
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

            #if DEBUG
            print("[Auth] Apple Sign In delegate called")
            #endif

            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let identityTokenData = credential.identityToken,
                  let identityToken = String(data: identityTokenData, encoding: .utf8),
                  let authCodeData = credential.authorizationCode,
                  let authCode = String(data: authCodeData, encoding: .utf8) else {
                #if DEBUG
                print("[Auth] Failed to extract credentials")
                #endif
                error = .invalidCredential
                return
            }

            #if DEBUG
            print("[Auth] Credentials extracted, calling backend...")
            #endif

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

                #if DEBUG
                print("[Auth] Backend response received, setting tokens...")
                #endif

                await APIClient.shared.setTokens(
                    access: response.accessToken,
                    refresh: response.refreshToken
                )

                currentUser = User(from: response.user)
                cacheUser(currentUser!)
                markAsSignedIn()
                #if DEBUG
                print("[Auth] User set: \(response.user.email), isAuthenticated: \(isAuthenticated)")
                #endif

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
        #if DEBUG
        print("[Auth] Error delegate called: \(error)")
        #endif
        // Track the auth error
        Task { @MainActor in
            ErrorHandler.shared.handleSilently(error, context: "authorizationController")
        }

        Task { @MainActor in
            isLoading = false

            if let authError = error as? ASAuthorizationError {
                #if DEBUG
                print("[Auth] ASAuthorizationError code: \(authError.code.rawValue)")
                #endif
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
    var customInstructions: String?

    nonisolated init(from dto: UserDTO) {
        self.id = dto.id
        self.email = dto.email
        self.name = dto.name
        self.avatarUrl = dto.avatarUrl
        self.isPremium = dto.isPremium
        self.customInstructions = dto.customInstructions
    }
}

// MARK: - Profile Update

extension AuthManager {
    func updateProfile(name: String?, customInstructions: String?) async throws {
        let request = ProfileUpdateRequest(name: name, customInstructions: customInstructions)
        let response: ProfileUpdateResponse = try await APIClient.shared.request(
            "/users/profile",
            method: .patch,
            body: request
        )
        currentUser = User(from: response.user)
        cacheUser(currentUser!)
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
