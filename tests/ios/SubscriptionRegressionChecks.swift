import Foundation

@main
struct SubscriptionRegressionChecks {
    static func main() throws {
        let validURL = APIConfiguration.normalizedBaseURL(" https://api.example.com/api/v1/ ")
        precondition(validURL?.absoluteString == "https://api.example.com/api/v1")
        for invalidURL in [
            "http://api.example.com/api/v1", "https://api.example.com",
            "https://user:password@api.example.com/api/v1",
            "https://api.example.com/api/v1?token=secret", "https://api.example.com/api/v1#fragment"
        ] {
            precondition(APIConfiguration.normalizedBaseURL(invalidURL) == nil)
        }

        func decode(_ json: String) throws -> VerifyPurchaseResponse {
            try JSONDecoder().decode(VerifyPurchaseResponse.self, from: Data(json.utf8))
        }
        let legacyResponse = try decode(#"{"success":true,"subscription":{"tier":"PRO","status":"ACTIVE","expiresAt":"2026-12-01T00:00:00Z"},"features":{"promptQuality":"standard","canExport":true,"maxTokensPerPrompt":4096}}"#)
        precondition(legacyResponse.activationConfirmed)
        precondition(legacyResponse.subscription?.isTrialing == nil)
        let missingEntitlement = try decode(#"{"success":true}"#)
        let rejected = try decode(#"{"success":false}"#)
        precondition(!missingEntitlement.activationConfirmed)
        precondition(!rejected.activationConfirmed)
        let expired = try decode(#"{"success":true,"subscription":{"tier":"PRO","status":"EXPIRED"},"features":{"promptQuality":"standard","canExport":true,"maxTokensPerPrompt":4096}}"#)
        precondition(!expired.activationConfirmed)
        let free = try decode(#"{"success":true,"subscription":{"tier":"FREE","status":"ACTIVE"},"features":{"promptQuality":"basic","canExport":false,"maxTokensPerPrompt":2048}}"#)
        precondition(!free.activationConfirmed)
        print("iOS configuration and subscription regressions passed")
    }
}
