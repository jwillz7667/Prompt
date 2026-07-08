//
//  OptimizeService.swift
//  Prompt
//
//  Client for the reflection-loop optimizer surface (`/api/v1/optimize`).
//  Stateless by design: job state lives on the server (jobs survive dropped
//  connections), UI state lives in OptimizeViewModel. All transport, auth,
//  and token refresh go through the APIClient actor.
//

import Foundation

// MARK: - Errors

/// Typed failures of the optimize surface. Transport-level `APIError`s are
/// mapped here at the service boundary so the view model can branch on
/// feature availability, tier gating, and retryability without inspecting
/// HTTP details.
enum OptimizeError: LocalizedError, Equatable, Sendable {
    /// REFLECTION_LOOP_ENABLED is off — the backend answers 404 with code
    /// FEATURE_DISABLED for the whole surface.
    case featureDisabled
    /// 403 FEATURE_LOCKED from quota enforcement — requires a paid tier.
    case upgradeRequired
    /// 403 QUOTA_EXCEEDED — daily enhancement quota exhausted.
    case quotaExceeded(remaining: Int)
    /// Definitive auth rejection. APIClient has already cleared tokens and
    /// signaled AuthManager.shared.handleSessionExpiration().
    case sessionExpired
    /// The job id is unknown to the server (expired TTL, restarted process,
    /// or a job that never existed).
    case jobNotFound
    /// The backend reported the job itself failed (SSE error event or a
    /// `failed` poll status).
    case serverReported(message: String)
    /// Transient transport failure — the job keeps running server-side, so
    /// callers should fall back to polling or retry.
    case transport(message: String)

    var errorDescription: String? {
        switch self {
        case .featureDisabled: return "Prompt optimization isn't available yet"
        case .upgradeRequired: return "Prompt optimization requires an upgraded plan"
        case .quotaExceeded: return "You've reached your daily prompt limit"
        case .sessionExpired: return "Session expired. Please sign in again"
        case .jobNotFound: return "This optimization is no longer available"
        case .serverReported(let message): return message
        case .transport(let message): return message
        }
    }

    /// Whether trying again (or falling back to polling) can succeed without
    /// the user changing anything about their account or input.
    var isRetryable: Bool {
        switch self {
        case .transport, .serverReported, .jobNotFound:
            return true
        case .featureDisabled, .upgradeRequired, .quotaExceeded, .sessionExpired:
            return false
        }
    }
}

// MARK: - Service

@MainActor
final class OptimizeService {
    static let shared = OptimizeService()

    private let apiClient: APIClient

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - API

    /// `POST /optimize` — start one optimization job (202 → { jobId, mode }).
    func startOptimization(
        rawPrompt: String,
        goal: String? = nil,
        targetModelFamily: TargetModelFamily? = nil,
        variableValues: [String: String]? = nil
    ) async throws -> OptimizeStartResponse {
        let request = OptimizeStartRequest(
            rawPrompt: rawPrompt,
            goal: goal,
            targetModelFamily: targetModelFamily,
            variableValues: variableValues
        )

        do {
            return try await apiClient.request(
                "/optimize",
                method: .post,
                body: request,
                timeoutInterval: 30
            )
        } catch let error as APIError {
            // The only 404 this route produces is the feature-flag gate
            // (routes/optimize.ts responds 404 + FEATURE_DISABLED while
            // REFLECTION_LOOP_ENABLED is off); job-scoped 404s exist only on
            // the /:jobId endpoints.
            throw OptimizeError(apiError: error, notFoundMeans: .featureDisabled)
        }
    }

    /// `GET /optimize/:jobId/stream` — SSE progress plus the terminal result.
    /// Yields `.progress` events and finishes after yielding `.result`. A
    /// server-side failure finishes by throwing
    /// `OptimizeError.serverReported`; transport failures surface as
    /// `OptimizeError` so callers can fall back to `pollResult`.
    func streamProgress(jobId: String) -> AsyncThrowingStream<OptimizeStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task { [apiClient] in
                do {
                    let upstream = await apiClient.requestRawEventStream(
                        "/optimize/\(jobId)/stream",
                        method: .get
                    )

                    for try await payload in upstream {
                        guard let event = Self.parseStreamEvent(payload) else { continue }

                        if case .failure(let message) = event {
                            continuation.finish(throwing: OptimizeError.serverReported(message: message))
                            return
                        }

                        continuation.yield(event)
                    }

                    continuation.finish()
                } catch let error as APIError {
                    continuation.finish(throwing: OptimizeError(apiError: error, notFoundMeans: .jobNotFound))
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    /// `GET /optimize/:jobId` — poll fallback for a dropped stream or clients
    /// without SSE. Safe to call repeatedly; the job survives server-side.
    func pollResult(jobId: String) async throws -> OptimizePollResponse {
        do {
            return try await apiClient.request(
                "/optimize/\(jobId)",
                method: .get,
                timeoutInterval: 30
            )
        } catch let error as APIError {
            throw OptimizeError(apiError: error, notFoundMeans: .jobNotFound)
        }
    }

    // MARK: - Pure parsing (no I/O — unit-testable in isolation)

    /// Decodes one SSE `data:` payload into a typed event. Returns nil for
    /// unknown or malformed events so the stream tolerates additive backend
    /// changes (same skip-on-decode-failure stance as APIClient.requestStream).
    static func parseStreamEvent(_ payload: Data) -> OptimizeStreamEvent? {
        try? JSONDecoder().decode(OptimizeStreamEvent.self, from: payload)
    }
}

// MARK: - APIError mapping

private extension OptimizeError {
    /// What a bare 404 means for the endpoint being called: the feature-flag
    /// gate on job creation, an unknown/expired job everywhere else.
    enum NotFoundMeaning {
        case featureDisabled
        case jobNotFound
    }

    init(apiError: APIError, notFoundMeans: NotFoundMeaning) {
        switch apiError {
        case .featureLocked:
            self = .upgradeRequired
        case .quotaExceeded(let remaining):
            self = .quotaExceeded(remaining: remaining)
        case .unauthorized, .notAuthenticated:
            self = .sessionExpired
        case .notFound:
            switch notFoundMeans {
            case .featureDisabled: self = .featureDisabled
            case .jobNotFound: self = .jobNotFound
            }
        case .httpError(403), .serverMessage(_, 403):
            // Every 403 on this surface is a tier gate: FEATURE_LOCKED and
            // QUOTA_EXCEEDED are typed above; the remaining code is
            // TARGET_MODEL_REQUIRES_SUBSCRIPTION (routes/optimize.ts §8 gate),
            // which APIClient surfaces as a generic 403.
            self = .upgradeRequired
        default:
            self = .transport(message: apiError.errorDescription ?? "Request failed")
        }
    }
}
