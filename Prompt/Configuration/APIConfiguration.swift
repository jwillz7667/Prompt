import Foundation

/// One HTTPS backend endpoint for REST, support chat, and app extensions.
nonisolated enum APIConfiguration {
    static let baseURL: URL = {
        let value = Bundle.main.object(forInfoDictionaryKey: "PromptAPIBaseURL") as? String
            ?? "https://backend-production-d7487.up.railway.app/api/v1"
        guard let url = normalizedBaseURL(value) else {
            preconditionFailure("PROMPT_API_BASE_URL must be an HTTPS URL ending in /api/v1, without credentials, query, or fragment")
        }
        return url
    }()

    static var origin: URL {
        var parts = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        parts.path = ""
        return parts.url!
    }

    static func normalizedBaseURL(_ value: String) -> URL? {
        guard var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https",
              let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil else { return nil }
        while parts.path.hasSuffix("/") { parts.path.removeLast() }
        guard parts.path == "/api/v1" else { return nil }
        return parts.url
    }
}
