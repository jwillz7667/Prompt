//
//  ErrorHandler.swift
//  Prompt
//
//  Comprehensive error handling system with categorization,
//  user-friendly messages, analytics tracking, and retry logic
//

import Foundation
import SwiftUI
import Network
import Combine

// MARK: - App Error Protocol

protocol AppErrorProtocol: LocalizedError, Sendable {
    var category: ErrorCategory { get }
    var isRetryable: Bool { get }
    var userMessage: String { get }
    var technicalMessage: String { get }
    var suggestedAction: ErrorAction? { get }
}

// MARK: - Error Categories

enum ErrorCategory: String, Sendable {
    case network = "Network"
    case authentication = "Authentication"
    case authorization = "Authorization"
    case validation = "Validation"
    case server = "Server"
    case client = "Client"
    case subscription = "Subscription"
    case storage = "Storage"
    case unknown = "Unknown"
}

// MARK: - Suggested Actions

enum ErrorAction: Sendable {
    case retry
    case signIn
    case upgrade
    case contactSupport
    case checkConnection
    case refreshApp
    case none

    var buttonTitle: String {
        switch self {
        case .retry: return "Try Again"
        case .signIn: return "Sign In"
        case .upgrade: return "View Plans"
        case .contactSupport: return "Contact Support"
        case .checkConnection: return "Check Connection"
        case .refreshApp: return "Refresh"
        case .none: return "OK"
        }
    }
}

// MARK: - Unified App Error

enum AppError: AppErrorProtocol, Equatable {
    // Network Errors
    case noConnection
    case timeout
    case serverUnreachable
    case sslError

    // Authentication Errors
    case notAuthenticated
    case sessionExpired
    case invalidCredentials
    case accountDisabled

    // Authorization Errors
    case unauthorized
    case quotaExceeded
    case featureLocked

    // Validation Errors
    case invalidInput(String)
    case missingRequired(String)

    // Server Errors
    case serverError(Int, String?)
    case maintenanceMode
    case rateLimited(retryAfter: Int?)

    // Client Errors
    case decodingFailed
    case encodingFailed
    case invalidResponse

    // Subscription Errors
    case purchaseFailed(String)
    case purchasePending
    case verificationFailed
    case restoreFailed

    // Storage Errors
    case keychainError(String)
    case dataCorrupted

    // Generic
    case unknown(String)
    case wrapped(Error)

    // MARK: - AppErrorProtocol

    var category: ErrorCategory {
        switch self {
        case .noConnection, .timeout, .serverUnreachable, .sslError:
            return .network
        case .notAuthenticated, .sessionExpired, .invalidCredentials, .accountDisabled:
            return .authentication
        case .unauthorized, .quotaExceeded, .featureLocked:
            return .authorization
        case .invalidInput, .missingRequired:
            return .validation
        case .serverError, .maintenanceMode, .rateLimited:
            return .server
        case .decodingFailed, .encodingFailed, .invalidResponse:
            return .client
        case .purchaseFailed, .purchasePending, .verificationFailed, .restoreFailed:
            return .subscription
        case .keychainError, .dataCorrupted:
            return .storage
        case .unknown, .wrapped:
            return .unknown
        }
    }

    var isRetryable: Bool {
        switch self {
        case .noConnection, .timeout, .serverUnreachable:
            return true
        case .serverError(let code, _) where code >= 500:
            return true
        case .rateLimited:
            return true
        case .sessionExpired:
            return true
        case .purchasePending:
            return false
        default:
            return false
        }
    }

    var userMessage: String {
        switch self {
        case .noConnection:
            return "No internet connection. Please check your network settings."
        case .timeout:
            return "The request timed out. Please try again."
        case .serverUnreachable:
            return "Unable to reach the server. Please try again later."
        case .sslError:
            return "Secure connection failed. Please check your network."

        case .notAuthenticated:
            return "Please sign in to continue."
        case .sessionExpired:
            return "Your session has expired. Please sign in again."
        case .invalidCredentials:
            return "Invalid credentials. Please try again."
        case .accountDisabled:
            return "Your account has been disabled. Contact support for help."

        case .unauthorized:
            return "You don't have permission to perform this action."
        case .quotaExceeded:
            return "You've reached your daily limit. Upgrade for more prompts."
        case .featureLocked:
            return "This feature requires a subscription upgrade."

        case .invalidInput(let field):
            return "Invalid \(field). Please check and try again."
        case .missingRequired(let field):
            return "\(field) is required."

        case .serverError(let code, _):
            return "Server error (\(code)). Please try again later."
        case .maintenanceMode:
            return "We're performing maintenance. Please try again soon."
        case .rateLimited(let retryAfter):
            if let seconds = retryAfter {
                return "Too many requests. Please wait \(seconds) seconds."
            }
            return "Too many requests. Please slow down."

        case .decodingFailed, .encodingFailed, .invalidResponse:
            return "Something went wrong. Please try again."

        case .purchaseFailed(let reason):
            return "Purchase failed: \(reason)"
        case .purchasePending:
            return "Your purchase is pending approval."
        case .verificationFailed:
            return "Unable to verify your purchase. Please contact support."
        case .restoreFailed:
            return "Unable to restore purchases. Please try again."

        case .keychainError:
            return "Unable to access secure storage."
        case .dataCorrupted:
            return "Data is corrupted. Please reinstall the app."

        case .unknown(let message):
            return message.isEmpty ? "An unexpected error occurred." : message
        case .wrapped(let error):
            return error.localizedDescription
        }
    }

    var technicalMessage: String {
        switch self {
        case .serverError(let code, let message):
            return "HTTP \(code): \(message ?? "No details")"
        case .wrapped(let error):
            return String(describing: error)
        default:
            return userMessage
        }
    }

    var suggestedAction: ErrorAction? {
        switch self {
        case .noConnection, .timeout, .serverUnreachable:
            return .checkConnection
        case .notAuthenticated, .sessionExpired, .invalidCredentials:
            return .signIn
        case .quotaExceeded, .featureLocked:
            return .upgrade
        case .rateLimited, .serverError, .maintenanceMode:
            return .retry
        case .verificationFailed, .accountDisabled:
            return .contactSupport
        default:
            return .retry
        }
    }

    // MARK: - LocalizedError

    var errorDescription: String? { userMessage }

    // MARK: - Equatable

    static func == (lhs: AppError, rhs: AppError) -> Bool {
        switch (lhs, rhs) {
        case (.noConnection, .noConnection),
             (.timeout, .timeout),
             (.serverUnreachable, .serverUnreachable),
             (.sslError, .sslError),
             (.notAuthenticated, .notAuthenticated),
             (.sessionExpired, .sessionExpired),
             (.invalidCredentials, .invalidCredentials),
             (.accountDisabled, .accountDisabled),
             (.unauthorized, .unauthorized),
             (.quotaExceeded, .quotaExceeded),
             (.featureLocked, .featureLocked),
             (.decodingFailed, .decodingFailed),
             (.encodingFailed, .encodingFailed),
             (.invalidResponse, .invalidResponse),
             (.purchasePending, .purchasePending),
             (.verificationFailed, .verificationFailed),
             (.restoreFailed, .restoreFailed),
             (.dataCorrupted, .dataCorrupted),
             (.maintenanceMode, .maintenanceMode):
            return true
        case (.invalidInput(let a), .invalidInput(let b)),
             (.missingRequired(let a), .missingRequired(let b)),
             (.keychainError(let a), .keychainError(let b)),
             (.unknown(let a), .unknown(let b)),
             (.purchaseFailed(let a), .purchaseFailed(let b)):
            return a == b
        case (.serverError(let c1, let m1), .serverError(let c2, let m2)):
            return c1 == c2 && m1 == m2
        case (.rateLimited(let a), .rateLimited(let b)):
            return a == b
        default:
            return false
        }
    }
}

// MARK: - Error Handler Service

@MainActor
final class ErrorHandler: ObservableObject {
    static let shared = ErrorHandler()

    @Published var currentError: AppError?
    @Published var showError = false

    private let analytics = AnalyticsService.shared
    private var retryQueue: [() async throws -> Void] = []

    private init() {}

    // MARK: - Handle Error

    func handle(_ error: Error, context: String? = nil, file: String = #file, line: Int = #line) {
        let appError = mapToAppError(error)

        // Log to analytics
        trackError(appError, context: context, file: file, line: line)

        // Log to console in debug
        #if DEBUG
        print("[ErrorHandler] \(appError.category.rawValue) error in \(context ?? "unknown"): \(appError.technicalMessage)")
        #endif

        // Show to user
        currentError = appError
        showError = true
    }

    func handleSilently(_ error: Error, context: String? = nil, file: String = #file, line: Int = #line) {
        let appError = mapToAppError(error)
        trackError(appError, context: context, file: file, line: line)

        #if DEBUG
        print("[ErrorHandler] Silent: \(appError.category.rawValue) - \(appError.technicalMessage)")
        #endif
    }

    // MARK: - Map Errors

    func mapToAppError(_ error: Error) -> AppError {
        // Already an AppError
        if let appError = error as? AppError {
            return appError
        }

        // APIError mapping
        if let apiError = error as? APIError {
            switch apiError {
            case .invalidURL:
                return .unknown("Invalid URL")
            case .invalidResponse:
                return .invalidResponse
            case .notAuthenticated:
                return .notAuthenticated
            case .unauthorized:
                return .sessionExpired
            case .requestTimedOut:
                return .timeout
            case .badRequest(let message):
                if message.lowercased().contains("quota") || message.lowercased().contains("limit") {
                    return .quotaExceeded
                }
                return .invalidInput(message)
            case .notFound:
                return .serverError(404, "Resource not found")
            case .rateLimited:
                return .rateLimited(retryAfter: nil)
            case .quotaExceeded:
                return .quotaExceeded
            case .featureLocked:
                return .featureLocked
            case .serverMessage(let message, let code):
                return .serverError(code, message)
            case .serverError(let code):
                return .serverError(code, nil)
            case .httpError(let code):
                return .serverError(code, nil)
            case .decodingError:
                return .decodingFailed
            }
        }

        // StoreError mapping
        if let storeError = error as? StoreError {
            switch storeError {
            case .failedToLoadProducts:
                return .purchaseFailed("Failed to load subscription options")
            case .purchaseFailed(let underlying):
                return .purchaseFailed(underlying.localizedDescription)
            case .purchasePending:
                return .purchasePending
            case .failedVerification:
                return .verificationFailed
            case .unknownPurchaseResult:
                return .purchaseFailed("Unknown purchase result")
            case .restoreFailed:
                return .restoreFailed
            case .trialNotAvailable(let message):
                return .purchaseFailed(message)
            case .trialFailed(let underlying):
                return .purchaseFailed(underlying.localizedDescription)
            }
        }

        // AuthError mapping
        if let authError = error as? AuthError {
            switch authError {
            case .invalidCredential:
                return .invalidCredentials
            case .failed, .invalidResponse, .notHandled, .notInteractive, .unknown:
                return .notAuthenticated
            case .serverError(let message):
                return .unknown(message)
            case .notImplemented(let message):
                return .unknown(message)
            }
        }

        // URL errors
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                return .noConnection
            case .timedOut:
                return .timeout
            case .cannotConnectToHost, .cannotFindHost:
                return .serverUnreachable
            case .serverCertificateUntrusted, .secureConnectionFailed:
                return .sslError
            default:
                return .unknown(urlError.localizedDescription)
            }
        }

        // Decoding errors
        if error is DecodingError {
            return .decodingFailed
        }

        // Encoding errors
        if error is EncodingError {
            return .encodingFailed
        }

        // NS errors
        if let nsError = error as NSError? {
            // Keychain errors
            if nsError.domain == NSOSStatusErrorDomain {
                return .keychainError(nsError.localizedDescription)
            }
        }

        return .wrapped(error)
    }

    // MARK: - Analytics Tracking

    private func trackError(_ error: AppError, context: String?, file: String, line: Int) {
        let fileName = (file as NSString).lastPathComponent

        analytics.logEvent(.errorOccurred, parameters: [
            .errorCode: error.category.rawValue,
            .errorMessage: error.technicalMessage
        ])

        analytics.logError(message: "[\(fileName):\(line)] \(context ?? ""): \(error.technicalMessage)")
    }

    // MARK: - Retry Logic

    func withRetry<T>(
        maxAttempts: Int = 3,
        initialDelay: TimeInterval = 1.0,
        maxDelay: TimeInterval = 30.0,
        operation: @escaping () async throws -> T
    ) async throws -> T {
        var lastError: Error?
        var delay = initialDelay

        for attempt in 1...maxAttempts {
            do {
                return try await operation()
            } catch {
                lastError = error
                let appError = mapToAppError(error)

                // Don't retry non-retryable errors
                guard appError.isRetryable && attempt < maxAttempts else {
                    throw error
                }

                #if DEBUG
                print("[ErrorHandler] Retry \(attempt)/\(maxAttempts) after \(delay)s for: \(appError.technicalMessage)")
                #endif

                // Exponential backoff
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                delay = min(delay * 2, maxDelay)
            }
        }

        throw lastError ?? AppError.unknown("Retry failed")
    }

    // MARK: - Clear Error

    func clearError() {
        currentError = nil
        showError = false
    }
}

// MARK: - Network Monitor

@MainActor
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()

    @Published private(set) var isConnected = true
    @Published private(set) var connectionType: ConnectionType = .unknown

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")

    enum ConnectionType: String {
        case wifi = "WiFi"
        case cellular = "Cellular"
        case wired = "Wired"
        case unknown = "Unknown"
    }

    private init() {
        startMonitoring()
    }

    func startMonitoring() {
        monitor.pathUpdateHandler = { [self] path in
            let isConnected = path.status == .satisfied
            let connectionType = Self.connectionType(for: path)

            Task { @MainActor [self, isConnected, connectionType] in
                self.isConnected = isConnected
                self.connectionType = connectionType
            }
        }
        monitor.start(queue: queue)
    }

    func stopMonitoring() {
        monitor.cancel()
    }

    private nonisolated static func connectionType(for path: NWPath) -> ConnectionType {
        if path.usesInterfaceType(.wifi) {
            return .wifi
        } else if path.usesInterfaceType(.cellular) {
            return .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            return .wired
        }
        return .unknown
    }
}

// MARK: - Error Alert View Modifier

struct ErrorAlertModifier: ViewModifier {
    @ObservedObject var errorHandler: ErrorHandler
    var onAction: ((ErrorAction) -> Void)?

    func body(content: Content) -> some View {
        content
            .alert(
                "Error",
                isPresented: $errorHandler.showError,
                presenting: errorHandler.currentError
            ) { error in
                if let action = error.suggestedAction, action != .none {
                    Button(action.buttonTitle) {
                        onAction?(action)
                        errorHandler.clearError()
                    }
                    if action != .retry {
                        Button("Dismiss", role: .cancel) {
                            errorHandler.clearError()
                        }
                    }
                } else {
                    Button("OK") {
                        errorHandler.clearError()
                    }
                }
            } message: { error in
                Text(error.userMessage)
            }
    }
}

extension View {
    @MainActor
    func errorAlert(
        onAction: ((ErrorAction) -> Void)? = nil
    ) -> some View {
        errorAlert(handler: .shared, onAction: onAction)
    }

    @MainActor
    func errorAlert(
        handler: ErrorHandler,
        onAction: ((ErrorAction) -> Void)? = nil
    ) -> some View {
        modifier(ErrorAlertModifier(errorHandler: handler, onAction: onAction))
    }
}

// MARK: - Offline Banner View

struct OfflineBanner: View {
    @Environment(\.colorScheme) private var colorScheme
    @ObservedObject var networkMonitor: NetworkMonitor = .shared

    var body: some View {
        if !networkMonitor.isConnected {
            HStack {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 12, weight: .bold))

                Text("Offline. Some actions will resume when the connection returns.")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .lineLimit(2)
            }
            .foregroundStyle(Color.adaptiveTextPrimary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: 360)
            .background {
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay {
                        Capsule()
                            .stroke(
                                colorScheme == .dark
                                    ? Color.red.opacity(0.35)
                                    : Color.red.opacity(0.2),
                                lineWidth: 1
                            )
                    }
            }
            .shadow(
                color: Color.black.opacity(colorScheme == .dark ? 0.18 : 0.08),
                radius: 16,
                y: 8
            )
            .padding(.top, 10)
            .padding(.horizontal, 16)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

// MARK: - Result Extension

extension Result where Failure == Error {
    @MainActor
    var appError: AppError? {
        switch self {
        case .success:
            return nil
        case .failure(let error):
            return ErrorHandler.shared.mapToAppError(error)
        }
    }
}
