//
//  APIClient.swift
//  Prompt
//
//  Enterprise-grade API client with authentication, retry logic, and error handling
//

import Foundation
import UIKit

actor APIClient {
    static let shared = APIClient()

    // MARK: - Configuration

    // Use production backend for all builds (change to localhost for local dev)
    private let baseURL = "https://backend-production-d538.up.railway.app/api/v1"

    private var accessToken: String?
    private var refreshToken: String?
    private var isRefreshing = false
    private var pendingRequests: [CheckedContinuation<Void, Error>] = []

    // URLSession configured for long-running requests that should survive app backgrounding
    private let urlSession: URLSession = {
        let config = URLSessionConfiguration.default
        // Allow requests to wait for connectivity instead of failing immediately
        config.waitsForConnectivity = true
        // Extend timeouts for background scenarios
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 300
        // Allow cellular access
        config.allowsCellularAccess = true
        // Allow expensive network access (5G, etc.)
        config.allowsExpensiveNetworkAccess = true
        // Allow constrained network access (Low Data Mode)
        config.allowsConstrainedNetworkAccess = true
        return URLSession(configuration: config)
    }()

    // MARK: - Token Management

    func setTokens(access: String, refresh: String) {
        self.accessToken = access
        self.refreshToken = refresh
        // Persist tokens securely using shared keychain for extension access
        SharedKeychainHelper.save(key: .accessToken, value: access)
        SharedKeychainHelper.save(key: .refreshToken, value: refresh)
        // Also update shared data manager
        SharedDataManager.shared.isAuthenticated = true
    }

    func loadStoredTokens() {
        // Migrate from legacy keychain if needed
        SharedKeychainHelper.migrateFromLegacyKeychain()
        // Load from shared keychain
        self.accessToken = SharedKeychainHelper.load(key: .accessToken)
        self.refreshToken = SharedKeychainHelper.load(key: .refreshToken)
    }

    func clearTokens() {
        self.accessToken = nil
        self.refreshToken = nil
        SharedKeychainHelper.deleteAll()
        // Update shared data manager
        SharedDataManager.shared.isAuthenticated = false
        SharedDataManager.shared.updateAuthState(isAuthenticated: false, name: nil, email: nil)
    }

    var isAuthenticated: Bool {
        accessToken != nil
    }

    // MARK: - Request Methods

    func request<T: Decodable>(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: (any Encodable)? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {
        let data = try await performRequest(endpoint, method: method, body: body, requiresAuth: requiresAuth)
        let decoder = JSONDecoder()
        return try decoder.decode(T.self, from: data)
    }

    func requestVoid(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: (any Encodable)? = nil,
        requiresAuth: Bool = true
    ) async throws {
        _ = try await performRequest(endpoint, method: method, body: body, requiresAuth: requiresAuth)
    }

    // MARK: - Streaming Request

    func requestStream(
        _ endpoint: String,
        method: HTTPMethod = .post,
        body: (any Encodable)? = nil
    ) -> AsyncThrowingStream<StreamEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    guard let url = URL(string: "\(baseURL)\(endpoint)") else {
                        continuation.finish(throwing: APIError.invalidURL)
                        return
                    }

                    var request = URLRequest(url: url)
                    request.httpMethod = method.rawValue
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 120 // Longer timeout for streaming

                    let deviceId = await MainActor.run { UIDevice.current.identifierForVendor?.uuidString }
                    request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")

                    guard let token = accessToken else {
                        continuation.finish(throwing: APIError.notAuthenticated)
                        return
                    }
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

                    if let body = body {
                        request.httpBody = try JSONEncoder().encode(body)
                    }

                    let (bytes, response) = try await urlSession.bytes(for: request)

                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: APIError.invalidResponse)
                        return
                    }

                    if httpResponse.statusCode == 401 {
                        continuation.finish(throwing: APIError.unauthorized)
                        return
                    }

                    guard httpResponse.statusCode == 200 else {
                        continuation.finish(throwing: APIError.httpError(httpResponse.statusCode))
                        return
                    }

                    for try await line in bytes.lines {
                        if line.hasPrefix("data: ") {
                            let data = String(line.dropFirst(6))
                            if data == "[DONE]" {
                                continuation.finish()
                                return
                            }

                            if let jsonData = data.data(using: .utf8),
                               let event = try? JSONDecoder().decode(StreamEvent.self, from: jsonData) {
                                continuation.yield(event)

                                if case .error = event.type {
                                    continuation.finish(throwing: APIError.badRequest(event.message ?? "Stream error"))
                                    return
                                }
                            }
                        }
                    }

                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Core Request Logic

    private func performRequest(
        _ endpoint: String,
        method: HTTPMethod,
        body: (any Encodable)?,
        requiresAuth: Bool,
        isRetry: Bool = false
    ) async throws -> Data {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Get device ID on main actor
        let deviceId = await MainActor.run { UIDevice.current.identifierForVendor?.uuidString }
        request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
        request.timeoutInterval = 30

        if requiresAuth {
            guard let token = accessToken else {
                throw APIError.notAuthenticated
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await urlSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return data

        case 401:
            // Token expired - try refresh
            if !isRetry && requiresAuth {
                try await refreshAccessToken()
                return try await performRequest(endpoint, method: method, body: body, requiresAuth: requiresAuth, isRetry: true)
            }
            throw APIError.unauthorized

        case 400:
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw APIError.badRequest(errorResponse?.error ?? "Bad request")

        case 404:
            throw APIError.notFound

        case 403:
            // Check if it's a quota exceeded error
            let errorResponse = try? JSONDecoder().decode(QuotaErrorResponse.self, from: data)
            if errorResponse?.code == "QUOTA_EXCEEDED" {
                throw APIError.quotaExceeded(remaining: errorResponse?.remainingQuota ?? 0)
            } else if errorResponse?.code == "FEATURE_LOCKED" {
                throw APIError.featureLocked
            }
            throw APIError.httpError(403)

        case 429:
            throw APIError.rateLimited

        case 500...599:
            throw APIError.serverError(httpResponse.statusCode)

        default:
            throw APIError.httpError(httpResponse.statusCode)
        }
    }

    // MARK: - Token Refresh

    private func refreshAccessToken() async throws {
        guard let refresh = refreshToken else {
            throw APIError.notAuthenticated
        }

        // Prevent multiple simultaneous refresh attempts
        if isRefreshing {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                pendingRequests.append(continuation)
            }
            return
        }

        isRefreshing = true

        do {
            let body = RefreshTokenRequest(refreshToken: refresh)

            guard let url = URL(string: "\(baseURL)/auth/refresh") else {
                isRefreshing = false
                resumePendingRequests(with: APIError.invalidURL)
                throw APIError.invalidURL
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)

            let (data, response) = try await urlSession.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                isRefreshing = false
                resumePendingRequests(with: APIError.invalidResponse)
                throw APIError.invalidResponse
            }

            guard httpResponse.statusCode == 200 else {
                clearTokens()
                isRefreshing = false
                resumePendingRequests(with: APIError.unauthorized)
                throw APIError.unauthorized
            }

            let tokenResponse = try JSONDecoder().decode(TokenRefreshResponse.self, from: data)
            setTokens(access: tokenResponse.accessToken, refresh: tokenResponse.refreshToken)

            isRefreshing = false
            resumePendingRequests(with: nil)
        } catch {
            isRefreshing = false
            resumePendingRequests(with: error)
            throw error
        }
    }

    private func resumePendingRequests(with error: Error?) {
        let requests = pendingRequests
        pendingRequests.removeAll()
        for continuation in requests {
            if let error = error {
                continuation.resume(throwing: error)
            } else {
                continuation.resume()
            }
        }
    }
}

// MARK: - HTTP Method

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

// MARK: - API Errors

enum APIError: LocalizedError, Sendable {
    case invalidURL
    case invalidResponse
    case notAuthenticated
    case unauthorized
    case badRequest(String)
    case notFound
    case rateLimited
    case quotaExceeded(remaining: Int)
    case featureLocked
    case serverError(Int)
    case httpError(Int)
    case decodingError

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response from server"
        case .notAuthenticated: return "Please sign in to continue"
        case .unauthorized: return "Session expired. Please sign in again"
        case .badRequest(let message): return message
        case .notFound: return "Resource not found"
        case .rateLimited: return "Too many requests. Please wait a moment"
        case .quotaExceeded: return "You've reached your daily prompt limit"
        case .featureLocked: return "This feature requires a subscription upgrade"
        case .serverError(let code): return "Server error (\(code))"
        case .httpError(let code): return "Request failed (\(code))"
        case .decodingError: return "Failed to process response"
        }
    }

    var isQuotaExceeded: Bool {
        if case .quotaExceeded = self { return true }
        return false
    }
}

// MARK: - Request/Response Models

struct RefreshTokenRequest: Encodable, Sendable {
    let refreshToken: String

    nonisolated func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(refreshToken, forKey: .refreshToken)
    }

    private enum CodingKeys: String, CodingKey {
        case refreshToken
    }
}

struct APIErrorResponse: Decodable, Sendable {
    let error: String
    let code: String?

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        error = try container.decode(String.self, forKey: .error)
        code = try container.decodeIfPresent(String.self, forKey: .code)
    }

    private enum CodingKeys: String, CodingKey {
        case error, code
    }
}

struct QuotaErrorResponse: Decodable, Sendable {
    let error: String
    let code: String?
    let message: String?
    let remainingQuota: Int?

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        error = try container.decode(String.self, forKey: .error)
        code = try container.decodeIfPresent(String.self, forKey: .code)
        message = try container.decodeIfPresent(String.self, forKey: .message)
        remainingQuota = try container.decodeIfPresent(Int.self, forKey: .remainingQuota)
    }

    private enum CodingKeys: String, CodingKey {
        case error, code, message, remainingQuota
    }
}

struct TokenRefreshResponse: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try container.decode(String.self, forKey: .accessToken)
        refreshToken = try container.decode(String.self, forKey: .refreshToken)
    }

    private enum CodingKeys: String, CodingKey {
        case accessToken, refreshToken
    }
}

struct AuthResponse: Decodable, Sendable {
    let user: UserDTO
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        user = try container.decode(UserDTO.self, forKey: .user)
        accessToken = try container.decode(String.self, forKey: .accessToken)
        refreshToken = try container.decode(String.self, forKey: .refreshToken)
        expiresIn = try container.decode(Int.self, forKey: .expiresIn)
    }

    private enum CodingKeys: String, CodingKey {
        case user, accessToken, refreshToken, expiresIn
    }
}

struct UserDTO: Codable, Sendable {
    let id: String
    let email: String
    let name: String?
    let avatarUrl: String?
    let isPremium: Bool
    let customInstructions: String?

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        email = try container.decode(String.self, forKey: .email)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        isPremium = try container.decode(Bool.self, forKey: .isPremium)
        customInstructions = try container.decodeIfPresent(String.self, forKey: .customInstructions)
    }

    nonisolated func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(email, forKey: .email)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(avatarUrl, forKey: .avatarUrl)
        try container.encode(isPremium, forKey: .isPremium)
        try container.encodeIfPresent(customInstructions, forKey: .customInstructions)
    }

    private enum CodingKeys: String, CodingKey {
        case id, email, name, avatarUrl, isPremium, customInstructions
    }
}

// MARK: - Profile Update Request

struct ProfileUpdateRequest: Encodable, Sendable {
    let name: String?
    let customInstructions: String?

    nonisolated func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(customInstructions, forKey: .customInstructions)
    }

    private enum CodingKeys: String, CodingKey {
        case name, customInstructions
    }
}

struct ProfileUpdateResponse: Decodable, Sendable {
    let user: UserDTO

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        user = try container.decode(UserDTO.self, forKey: .user)
    }

    private enum CodingKeys: String, CodingKey {
        case user
    }
}

// MARK: - Keychain Helper

enum KeychainHelper {
    nonisolated static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    nonisolated static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    nonisolated static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - Stream Event

enum StreamEventType: String, Codable, Sendable {
    case token
    case complete
    case error
}

struct StreamEvent: Codable, Sendable {
    let type: StreamEventType
    let content: String?
    let message: String?
    let promptId: String?
    // Thread-specific fields
    let threadId: String?
    let turnId: String?
    let turnIndex: Int?
    let usage: StreamUsage?
    let subscription: StreamSubscription?

    struct StreamUsage: Codable, Sendable {
        let inputTokens: Int
        let outputTokens: Int
        let totalTokens: Int
        let processingMs: Int
    }

    struct StreamSubscription: Codable, Sendable {
        let tier: String
        let promptQuality: String
        let dailyPromptsUsed: Int
        let dailyPromptsLimit: Int
    }
}
