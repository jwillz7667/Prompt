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

    // Configured by the PROMPT_API_BASE_URL build setting.
    private let baseURL = APIConfiguration.baseURL.absoluteString

    private(set) var sessionVersion: UInt = 0
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

    /// For launch-gating checks (`/auth/me`, `/subscriptions/status`). With
    /// `waitsForConnectivity` an offline request waits for the 300 s resource
    /// timeout before the caller can fall back to cached state; these must
    /// fail immediately offline and give up quickly on a dead connection.
    private let failFastSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 12
        config.timeoutIntervalForResource = 15
        config.allowsCellularAccess = true
        config.allowsExpensiveNetworkAccess = true
        config.allowsConstrainedNetworkAccess = true
        return URLSession(configuration: config)
    }()

    /// How a request behaves when the device has no usable connection.
    enum ConnectivityPolicy: Sendable {
        /// Wait (up to the resource timeout) for connectivity to return.
        case waitForConnectivity
        /// Fail at once so the caller can fall back to cached state.
        case failFast
    }

    // MARK: - Token Management

    func setTokens(access: String, refresh: String) async throws {
        try await storeTokens(access: access, refresh: refresh)
        sessionVersion &+= 1
    }

    private func storeTokens(access: String, refresh: String) async throws {
        let previousAccess = SharedKeychainHelper.load(key: .accessToken)
        let previousRefresh = SharedKeychainHelper.load(key: .refreshToken)
        guard SharedKeychainHelper.save(key: .refreshToken, value: refresh),
              SharedKeychainHelper.save(key: .accessToken, value: access) else {
            if let previousRefresh { SharedKeychainHelper.save(key: .refreshToken, value: previousRefresh) }
            else { SharedKeychainHelper.delete(key: .refreshToken) }
            if let previousAccess { SharedKeychainHelper.save(key: .accessToken, value: previousAccess) }
            else { SharedKeychainHelper.delete(key: .accessToken) }
            throw APIError.secureStorageUnavailable
        }
        self.accessToken = access
        self.refreshToken = refresh
        // Also update shared data manager
        await MainActor.run {
            SharedDataManager.shared.isAuthenticated = true
        }
    }

    func loadStoredTokens() {
        // Migrate from legacy keychain if needed
        SharedKeychainHelper.migrateFromLegacyKeychain()
        // Load from shared keychain
        self.accessToken = SharedKeychainHelper.load(key: .accessToken)
        self.refreshToken = SharedKeychainHelper.load(key: .refreshToken)
    }

    func clearTokens() async {
        sessionVersion &+= 1
        self.accessToken = nil
        self.refreshToken = nil
        SharedKeychainHelper.deleteAll()
        // Update shared data manager
        await MainActor.run {
            SharedDataManager.shared.isAuthenticated = false
            SharedDataManager.shared.updateAuthState(isAuthenticated: false, name: nil, email: nil)
        }
    }

    var isAuthenticated: Bool {
        if accessToken == nil {
            loadStoredTokens()
        }
        return accessToken != nil
    }

    // MARK: - Request Methods

    func request<T: Decodable>(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: (any Encodable)? = nil,
        requiresAuth: Bool = true,
        timeoutInterval: TimeInterval = 30,
        connectivity: ConnectivityPolicy = .waitForConnectivity
    ) async throws -> T {
        let data = try await performRequest(
            endpoint,
            method: method,
            body: body,
            requiresAuth: requiresAuth,
            timeoutInterval: timeoutInterval,
            connectivity: connectivity
        )
        let decoder = Self.makeJSONDecoder()
        return try decoder.decode(T.self, from: data)
    }

    func requestVoid(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: (any Encodable)? = nil,
        requiresAuth: Bool = true,
        timeoutInterval: TimeInterval = 30,
        connectivity: ConnectivityPolicy = .waitForConnectivity
    ) async throws {
        _ = try await performRequest(
            endpoint,
            method: method,
            body: body,
            requiresAuth: requiresAuth,
            timeoutInterval: timeoutInterval,
            connectivity: connectivity
        )
    }

    // MARK: - Server-Sent Events

    /// Opens a server-sent-events request and yields each decoded event.
    ///
    /// - Decoding happens on this actor, never on the MainActor. `Event` must
    ///   therefore have a nonisolated `Decodable` conformance (declare the type
    ///   `nonisolated struct`).
    /// - An event whose `failure` is non-nil is thrown, never yielded, so
    ///   consumers see each server error exactly once.
    /// - A payload that fails to decode is skipped only when its `type` is not
    ///   one of `Event.terminalEventTypes`; a malformed terminal event throws
    ///   `APIError.decodingError` instead of silently ending the stream.
    /// - Cancelling the consuming task (or dropping the stream) cancels the
    ///   underlying URLSession request, so the server observes the disconnect.
    func streamEvents<Event: ServerSentEvent>(
        path: String,
        method: HTTPMethod = .post,
        body: (any Encodable & Sendable)? = nil,
        requiresAuth: Bool = true,
        as eventType: Event.Type = Event.self
    ) -> AsyncThrowingStream<Event, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                await self.pumpEvents(
                    Event.self,
                    path: path,
                    method: method,
                    body: body,
                    requiresAuth: requiresAuth,
                    continuation: continuation
                )
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func pumpEvents<Event: ServerSentEvent>(
        _ eventType: Event.Type,
        path: String,
        method: HTTPMethod,
        body: (any Encodable & Sendable)?,
        requiresAuth: Bool,
        continuation: AsyncThrowingStream<Event, Error>.Continuation
    ) async {
        do {
            let connection = try await openEventStream(
                path,
                method: method,
                body: body,
                requiresAuth: requiresAuth,
                isRetry: false
            )
            for try await line in connection.bytes.lines {
                try Task.checkCancellation()
                guard !requiresAuth || sessionVersion == connection.sessionVersion else {
                    throw APIError.unauthorized
                }
                guard let payload = Self.ssePayload(from: line) else { continue }
                if payload == Self.sseDoneMarker { break }
                guard let event = try Self.decodeEvent(Event.self, from: payload) else { continue }
                if let failure = event.failure {
                    throw surfaced(failure)
                }
                continuation.yield(event)
            }
            continuation.finish()
        } catch {
            continuation.finish(throwing: Self.normalizedTransportError(error))
        }
    }

    /// Prompt-optimizer thread stream (`/threads`, `/threads/:id/turns/stream`).
    func requestStream(
        _ endpoint: String,
        method: HTTPMethod = .post,
        body: (any Encodable & Sendable)? = nil,
        requiresAuth: Bool = true
    ) -> AsyncThrowingStream<StreamEvent, Error> {
        streamEvents(path: endpoint, method: method, body: body, requiresAuth: requiresAuth)
    }

    // MARK: - Raw SSE Streaming

    /// Generic server-sent-events transport: yields each `data:` payload as raw
    /// bytes so feature services own event decoding (e.g. OptimizeService).
    /// SSE comment lines (`: heartbeat`) are skipped and `[DONE]` finishes the
    /// stream. Shares token refresh and HTTP error mapping with `streamEvents`.
    func requestRawEventStream(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: (any Encodable & Sendable)? = nil,
        requiresAuth: Bool = true
    ) -> AsyncThrowingStream<Data, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                await self.pumpRawEvents(
                    endpoint,
                    method: method,
                    body: body,
                    requiresAuth: requiresAuth,
                    continuation: continuation
                )
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func pumpRawEvents(
        _ endpoint: String,
        method: HTTPMethod,
        body: (any Encodable & Sendable)?,
        requiresAuth: Bool,
        continuation: AsyncThrowingStream<Data, Error>.Continuation
    ) async {
        do {
            let connection = try await openEventStream(
                endpoint,
                method: method,
                body: body,
                requiresAuth: requiresAuth,
                isRetry: false
            )
            for try await line in connection.bytes.lines {
                try Task.checkCancellation()
                guard !requiresAuth || sessionVersion == connection.sessionVersion else {
                    throw APIError.unauthorized
                }
                guard let payload = Self.ssePayload(from: line) else { continue }
                if payload == Self.sseDoneMarker { break }
                continuation.yield(Data(payload.utf8))
            }
            continuation.finish()
        } catch {
            continuation.finish(throwing: Self.normalizedTransportError(error))
        }
    }

    private struct EventStreamConnection {
        let bytes: URLSession.AsyncBytes
        let sessionVersion: UInt
    }

    /// Sends the request and validates the HTTP status. Every non-200 status
    /// is mapped here, before the caller reads any event, so entitlement and
    /// fair-use rejections arrive as typed errors rather than stream events.
    private func openEventStream(
        _ endpoint: String,
        method: HTTPMethod,
        body: (any Encodable & Sendable)?,
        requiresAuth: Bool,
        isRetry: Bool
    ) async throws -> EventStreamConnection {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }

        if requiresAuth && accessToken == nil {
            loadStoredTokens()
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.timeoutInterval = 120

        let deviceId = await MainActor.run { UIDevice.current.identifierForVendor?.uuidString }
        request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")

        if requiresAuth {
            guard let token = accessToken else {
                throw APIError.notAuthenticated
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try Self.makeJSONEncoder().encode(body)
        }

        let requestSessionVersion = sessionVersion
        let requestAccessToken = accessToken
        let (bytes, response) = try await urlSession.bytes(for: request)
        guard !requiresAuth || sessionVersion == requestSessionVersion else {
            throw APIError.unauthorized
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            if requiresAuth && !isRetry {
                if accessToken == requestAccessToken {
                    try await refreshAccessToken()
                }
                guard sessionVersion == requestSessionVersion else { throw APIError.unauthorized }
                return try await openEventStream(
                    endpoint,
                    method: method,
                    body: body,
                    requiresAuth: requiresAuth,
                    isRetry: true
                )
            }
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            let errorBody = try await Self.readErrorBody(from: bytes)
            throw surfaced(Self.mapErrorResponse(statusCode: httpResponse.statusCode, body: errorBody))
        }

        return EventStreamConnection(bytes: bytes, sessionVersion: requestSessionVersion)
    }

    private static let sseDoneMarker = "[DONE]"
    private static let maxErrorBodyBytes = 64 * 1024

    nonisolated private static func ssePayload(from line: String) -> String? {
        guard line.hasPrefix("data:") else { return nil }
        let payload = line.dropFirst(5)
        return String(payload.hasPrefix(" ") ? payload.dropFirst() : payload)
    }

    nonisolated private static func decodeEvent<Event: ServerSentEvent>(
        _ type: Event.Type,
        from payload: String
    ) throws -> Event? {
        let data = Data(payload.utf8)
        do {
            return try JSONDecoder().decode(Event.self, from: data)
        } catch {
            let envelope = try? JSONDecoder().decode(SSEEventEnvelope.self, from: data)
            if let eventType = envelope?.type, !Event.terminalEventTypes.contains(eventType) {
                // Additive event types from a newer backend are not fatal.
                return nil
            }
            throw APIError.decodingError
        }
    }

    private static func readErrorBody(from bytes: URLSession.AsyncBytes) async throws -> Data {
        var data = Data()
        for try await byte in bytes {
            data.append(byte)
            if data.count >= maxErrorBodyBytes { break }
        }
        return data
    }

    nonisolated private static func normalizedTransportError(_ error: Error) -> Error {
        if let urlError = error as? URLError, urlError.code == .timedOut {
            return APIError.requestTimedOut
        }
        return error
    }

    /// Entitlement loss is global state: any route that reports it flips the
    /// app back to the hard paywall, regardless of which screen made the call.
    private func surfaced(_ error: APIError) -> APIError {
        if case .subscriptionRequired = error {
            Task { @MainActor in
                StoreKitManager.shared.handleSubscriptionRequired()
            }
        }
        return error
    }

    // MARK: - Error Mapping

    /// Maps a non-2xx, non-401 response to a typed error. Server-provided text
    /// is only surfaced for validation-style failures (400/409/422); AI and
    /// infrastructure failures always use local copy keyed by `code`.
    nonisolated static func mapErrorResponse(statusCode: Int, body: Data) -> APIError {
        let envelope = try? JSONDecoder().decode(APIErrorEnvelope.self, from: body)

        if let envelope, let mapped = APIError.fromServerCode(
            envelope.code,
            reason: envelope.reason,
            retryable: envelope.retryable,
            retryAfterMs: envelope.retryAfterMs,
            resetAt: envelope.resetAt,
            remainingQuota: envelope.remainingQuota
        ) {
            return mapped
        }

        let serverText = envelope?.message ?? envelope?.error
        switch statusCode {
        case 400:
            return .badRequest(serverText ?? "Bad request")
        case 403:
            return .httpError(403)
        case 404:
            return .notFound
        case 409, 422:
            return .serverMessage(serverText ?? "Request could not be completed", statusCode)
        case 429:
            return .rateLimited
        case 500...599:
            return .serverError(statusCode)
        default:
            return .httpError(statusCode)
        }
    }

    // MARK: - Core Request Logic

    private func performRequest(
        _ endpoint: String,
        method: HTTPMethod,
        body: (any Encodable)?,
        requiresAuth: Bool,
        timeoutInterval: TimeInterval,
        connectivity: ConnectivityPolicy,
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
        request.timeoutInterval = timeoutInterval

        if requiresAuth && accessToken == nil {
            loadStoredTokens()
        }

        if requiresAuth {
            guard let token = accessToken else {
                throw APIError.notAuthenticated
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = try Self.makeJSONEncoder().encode(body)
        }

        let requestSessionVersion = sessionVersion
        let requestAccessToken = accessToken
        let data: Data
        let response: URLResponse

        do {
            let session = connectivity == .failFast ? failFastSession : urlSession
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError where urlError.code == .timedOut {
            throw APIError.requestTimedOut
        }

        guard !requiresAuth || sessionVersion == requestSessionVersion else {
            throw APIError.unauthorized
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return data

        case 401:
            if !requiresAuth {
                let failure = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
                throw APIError.serverMessage(failure?.message ?? failure?.error ?? "Sign-in could not be verified. Please try again.", 401)
            }
            // Token expired - try refresh
            if !isRetry {
                if accessToken == requestAccessToken {
                    try await refreshAccessToken()
                }
                guard sessionVersion == requestSessionVersion else { throw APIError.unauthorized }
                return try await performRequest(
                    endpoint,
                    method: method,
                    body: body,
                    requiresAuth: requiresAuth,
                    timeoutInterval: timeoutInterval,
                    connectivity: connectivity,
                    isRetry: true
                )
            }
            throw APIError.unauthorized

        default:
            throw surfaced(Self.mapErrorResponse(statusCode: httpResponse.statusCode, body: data))
        }
    }

    // MARK: - Token Refresh

    private func refreshAccessToken() async throws {
        if refreshToken == nil {
            loadStoredTokens()
        }

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
        let refreshSessionVersion = sessionVersion

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

            // Actor reentrancy allows sign-out or a new sign-in while this
            // request is in flight. An old refresh must never restore that
            // session or clear the new account's credentials.
            guard sessionVersion == refreshSessionVersion, refreshToken == refresh else {
                throw APIError.unauthorized
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                isRefreshing = false
                resumePendingRequests(with: APIError.invalidResponse)
                throw APIError.invalidResponse
            }

            guard httpResponse.statusCode == 200 else {
                // Only a definitive auth rejection means the refresh token is
                // no longer valid. Clearing tokens on any non-200 turns a
                // transient backend blip (429, 5xx, or a 502/503 while the
                // server restarts) into a silent logout — which drops the user
                // to the FREE tier and hides their server-side history. Keep
                // the session for transient failures and surface a retryable
                // error so the caller can back off instead.
                let isAuthRejection = httpResponse.statusCode == 401 || httpResponse.statusCode == 403
                if isAuthRejection {
                    await clearTokens()
                    // Preserve cached profile details while requiring sign-in
                    // again throughout the app and its extensions.
                    await MainActor.run { AuthManager.shared.handleSessionExpiration() }
                    isRefreshing = false
                    resumePendingRequests(with: APIError.unauthorized)
                    throw APIError.unauthorized
                }

                isRefreshing = false
                let transientError: APIError = httpResponse.statusCode == 429
                    ? .rateLimited
                    : .serverError(httpResponse.statusCode)
                resumePendingRequests(with: transientError)
                throw transientError
            }

            let tokenResponse = try JSONDecoder().decode(TokenRefreshResponse.self, from: data)
            try await storeTokens(access: tokenResponse.accessToken, refresh: tokenResponse.refreshToken)

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

    private static func makeJSONDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()

        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)

            let fractionalFormatter = ISO8601DateFormatter()
            fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let standardFormatter = ISO8601DateFormatter()
            standardFormatter.formatOptions = [.withInternetDateTime]

            if let date = fractionalFormatter.date(from: value) ?? standardFormatter.date(from: value) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(value)"
            )
        }

        return decoder
    }

    private static func makeJSONEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()

        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            let fractionalFormatter = ISO8601DateFormatter()
            fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            try container.encode(fractionalFormatter.string(from: date))
        }

        return encoder
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
    case requestTimedOut
    case badRequest(String)
    case notFound
    case rateLimited
    /// Legacy daily quota (403 QUOTA_EXCEEDED without a subscription reason).
    case quotaExceeded(remaining: Int)
    case featureLocked
    /// 403 QUOTA_EXCEEDED + reason SUBSCRIPTION_REQUIRED: no active
    /// subscription or trial. Flips the app to the hard paywall.
    case subscriptionRequired
    /// 429 FAIR_USE_LIMIT: the daily fair-use ceiling for subscribers.
    case fairUseLimit(resetAt: Date?)
    /// A typed AI-service failure (`toClientStreamError` on the backend).
    case service(ServiceFailure)
    /// 409 TRANSACTION_OWNED_BY_ANOTHER_USER from purchase activation.
    case transactionOwnedByAnotherAccount
    /// A 409 whose `code` needs a specific recovery (e.g. reloading a chat).
    case conflict(ConflictCode)
    case serverMessage(String, Int)
    case serverError(Int)
    case httpError(Int)
    case decodingError
    case secureStorageUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response from server"
        case .notAuthenticated: return "Please sign in to continue"
        case .unauthorized: return "Session expired. Please sign in again"
        case .requestTimedOut: return "This request took too long. Please try again."
        case .badRequest(let message): return message
        case .notFound: return "Resource not found"
        case .rateLimited: return "Too many requests. Please wait a moment"
        case .quotaExceeded: return "You've reached your daily prompt limit"
        case .featureLocked: return "This feature requires a subscription"
        case .subscriptionRequired: return ServiceMessages.subscriptionRequired
        case .fairUseLimit(let resetAt): return ServiceMessages.fairUseLimit(resetAt: resetAt)
        case .service(let failure): return failure.code.userMessage
        case .transactionOwnedByAnotherAccount: return ServiceMessages.transactionOwnedByAnotherAccount
        case .conflict(let conflict): return conflict.userMessage
        case .serverMessage(let message, _): return message
        case .serverError: return ServiceErrorCode.internalError.userMessage
        case .httpError(let code): return "Request failed (\(code))"
        case .decodingError: return "Failed to process response"
        case .secureStorageUnavailable: return "Your sign-in could not be saved securely. Please restart the app and try again."
        }
    }

    var isQuotaExceeded: Bool {
        if case .quotaExceeded = self { return true }
        return false
    }

    var isSubscriptionRequired: Bool {
        if case .subscriptionRequired = self { return true }
        return false
    }

    /// Maps a backend error `code` (HTTP body or SSE error event) to a typed
    /// error. Returns nil for codes that carry no client-specific meaning, so
    /// the caller falls back to HTTP-status mapping.
    nonisolated static func fromServerCode(
        _ code: String?,
        reason: String?,
        retryable: Bool?,
        retryAfterMs: Int?,
        resetAt: String?,
        remainingQuota: Int?
    ) -> APIError? {
        guard let code else { return nil }
        switch code {
        case "SUBSCRIPTION_REQUIRED":
            return .subscriptionRequired
        case "QUOTA_EXCEEDED":
            return reason == "SUBSCRIPTION_REQUIRED"
                ? .subscriptionRequired
                : .quotaExceeded(remaining: remainingQuota ?? 0)
        case "FEATURE_LOCKED":
            return .featureLocked
        case "FAIR_USE_LIMIT":
            return .fairUseLimit(resetAt: ServerDate.parse(resetAt))
        case "AUTH_REQUIRED":
            return .unauthorized
        case "TRANSACTION_OWNED_BY_ANOTHER_USER":
            return .transactionOwnedByAnotherAccount
        case ConflictCode.duplicateMessage.rawValue, ConflictCode.notLatestMessage.rawValue:
            return ConflictCode(rawValue: code).map { .conflict($0) }
        default:
            guard let serviceCode = ServiceErrorCode(rawValue: code) else { return nil }
            return .service(ServiceFailure(
                code: serviceCode,
                isRetryable: retryable ?? serviceCode.isRetryableByDefault,
                retryAfter: retryAfterMs.map { TimeInterval($0) / 1000 }
            ))
        }
    }
}

// MARK: - Conflicts

/// 409 `code`s from the chat API (`backend/src/features/chat/errors.ts`).
nonisolated enum ConflictCode: String, Sendable, Equatable {
    /// A message with this idempotency key was already stored.
    case duplicateMessage = "DUPLICATE_MESSAGE"
    /// Regenerate targeted a reply that is no longer the newest one.
    case notLatestMessage = "NOT_LATEST_MESSAGE"

    var userMessage: String {
        switch self {
        case .duplicateMessage:
            return String(localized: "That message was already sent.")
        case .notLatestMessage:
            return String(localized: "This chat changed on another device. It now shows the latest version.")
        }
    }
}

// MARK: - AI Service Failures

/// Client-visible AI failure codes (`ClientErrorCode` in
/// backend/src/features/llm/errors.ts). User copy lives in ErrorHandler.
nonisolated enum ServiceErrorCode: String, Sendable, Equatable {
    case providerUnavailable = "PROVIDER_UNAVAILABLE"
    case rateLimited = "RATE_LIMITED"
    case timeout = "TIMEOUT"
    case contextTooLong = "CONTEXT_TOO_LONG"
    case contentBlocked = "CONTENT_BLOCKED"
    case interrupted = "INTERRUPTED"
    case internalError = "INTERNAL_ERROR"

    var isRetryableByDefault: Bool {
        switch self {
        case .contextTooLong, .contentBlocked: return false
        case .providerUnavailable, .rateLimited, .timeout, .interrupted, .internalError: return true
        }
    }
}

nonisolated struct ServiceFailure: Sendable, Equatable {
    let code: ServiceErrorCode
    let isRetryable: Bool
    let retryAfter: TimeInterval?
}

/// Shape shared by JSON error bodies across routes. Every field is optional
/// so one decoder handles legacy and current backends.
nonisolated struct APIErrorEnvelope: Decodable, Sendable {
    let error: String?
    let code: String?
    let message: String?
    let reason: String?
    let remainingQuota: Int?
    let resetAt: String?
    let retryable: Bool?
    let retryAfterMs: Int?
}

// MARK: - Server-Sent Event Contract

/// An event decoded by `APIClient.streamEvents`.
nonisolated protocol ServerSentEvent: Decodable, Sendable {
    /// `type` values whose loss would corrupt the client's view of the
    /// stream; failing to decode one of these throws instead of skipping.
    static var terminalEventTypes: Set<String> { get }
    /// Non-nil when the event reports a server failure. The stream throws it
    /// instead of yielding the event.
    var failure: APIError? { get }
}

extension ServerSentEvent {
    nonisolated static var terminalEventTypes: Set<String> { ["complete", "error", "done"] }
}

nonisolated private struct SSEEventEnvelope: Decodable {
    let type: String?
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
    /// StoreKit `appAccountToken` binding App Store purchases to this
    /// account. Optional so responses from backends that predate it decode.
    let appAccountToken: UUID?

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        email = try container.decode(String.self, forKey: .email)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        isPremium = try container.decodeIfPresent(Bool.self, forKey: .isPremium) ?? false
        // A malformed token is treated as absent rather than failing sign-in;
        // purchases re-fetch the profile before buying.
        appAccountToken = try container.decodeIfPresent(String.self, forKey: .appAccountToken)
            .flatMap(UUID.init(uuidString:))
    }

    nonisolated func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(email, forKey: .email)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(avatarUrl, forKey: .avatarUrl)
        try container.encode(isPremium, forKey: .isPremium)
        try container.encodeIfPresent(appAccountToken?.uuidString.lowercased(), forKey: .appAccountToken)
    }

    private enum CodingKeys: String, CodingKey {
        case id, email, name, avatarUrl, isPremium, appAccountToken
    }
}

// MARK: - Profile Update Request

struct ProfileUpdateRequest: Encodable, Sendable {
    let name: String?

    nonisolated func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
    }

    private enum CodingKeys: String, CodingKey {
        case name
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

nonisolated enum StreamEventType: String, Codable, Sendable {
    case token
    case complete
    case error
}

/// Prompt-optimizer thread stream event.
nonisolated struct StreamEvent: ServerSentEvent {
    let type: StreamEventType
    let content: String?
    let message: String?
    let code: String?
    let reason: String?
    let retryable: Bool?
    let retryAfterMs: Int?
    let resetAt: String?
    let promptId: String?
    let threadId: String?
    let turnId: String?
    let turnIndex: Int?
    let attachment: StreamImageAttachment?
    let usage: StreamUsage?

    private enum CodingKeys: String, CodingKey {
        case type, content, message, code, reason, retryable, retryAfterMs, resetAt
        case promptId, threadId, turnId, turnIndex, usage
        case attachment = "imageAttachment"
    }

    struct StreamUsage: Codable, Sendable {
        let inputTokens: Int
        let outputTokens: Int
        let totalTokens: Int
        let processingMs: Int
    }

    /// Wire copy of `PromptImageAttachment`, decodable off the MainActor.
    struct StreamImageAttachment: Codable, Sendable {
        let dataUrl: String
        let mimeType: String
        let width: Int
        let height: Int
        let analysis: String?
    }

    var failure: APIError? {
        guard type == .error else { return nil }
        return APIError.fromServerCode(
            code,
            reason: reason,
            retryable: retryable,
            retryAfterMs: retryAfterMs,
            resetAt: resetAt,
            remainingQuota: nil
        ) ?? .service(ServiceFailure(
            code: .internalError,
            isRetryable: retryable ?? true,
            retryAfter: retryAfterMs.map { TimeInterval($0) / 1000 }
        ))
    }
}

extension StreamEvent {
    var imageAttachment: PromptImageAttachment? {
        attachment.map {
            PromptImageAttachment(
                dataUrl: $0.dataUrl,
                mimeType: $0.mimeType,
                width: $0.width,
                height: $0.height,
                analysis: $0.analysis
            )
        }
    }
}
