import Foundation
import Observation
import StoreKit

/// App Store storefront-driven compliance flags used to suppress restricted features.
@MainActor
@Observable
final class AppStoreComplianceManager {
    static let shared = AppStoreComplianceManager()

    private(set) var storefrontCountryCode: String?

    @ObservationIgnored
    private var storefrontUpdatesTask: Task<Void, Never>?

    var isChinaMainlandStorefront: Bool {
        storefrontCountryCode == "CHN"
    }

    /// All platform features are available globally (no third-party brand names exposed).
    var allowsAllFeatures: Bool { true }

    private init() {
        storefrontCountryCode = Self.resolveInitialStorefrontCountryCode()
        refreshCurrentStorefrontCountryCode()
        beginObservingStorefrontUpdatesIfNeeded()
    }

    deinit {
        storefrontUpdatesTask?.cancel()
    }

    func isPlatformAvailable(_ platform: PlatformType) -> Bool {
        true
    }

    func visiblePlatforms(includeCustom: Bool = true) -> [PlatformType] {
        PlatformType.allCases.filter { platform in
            (includeCustom || platform != .custom) && isPlatformAvailable(platform)
        }
    }

    private func beginObservingStorefrontUpdatesIfNeeded() {
        guard Self.overriddenStorefrontCountryCode == nil else { return }

        storefrontUpdatesTask = Task { @MainActor [weak self] in
            for await storefront in Storefront.updates {
                self?.storefrontCountryCode = storefront.countryCode.uppercased()
            }
        }
    }

    private func refreshCurrentStorefrontCountryCode() {
        guard Self.overriddenStorefrontCountryCode == nil else { return }

        Task { @MainActor [weak self] in
            if let currentStorefrontCountryCode = await Storefront.current?.countryCode {
                self?.storefrontCountryCode = currentStorefrontCountryCode.uppercased()
            }
        }
    }

    private static func resolveInitialStorefrontCountryCode() -> String? {
        if let overriddenStorefrontCountryCode {
            return overriddenStorefrontCountryCode
        }

        return nil
    }

    /// Storefront country codes use ISO 3166-1 alpha-3 values such as `USA` and `CHN`.
    private static var overriddenStorefrontCountryCode: String? {
        let arguments = ProcessInfo.processInfo.arguments

        if let argumentIndex = arguments.firstIndex(of: "-storefront_country_code"),
           arguments.indices.contains(argumentIndex + 1) {
            return arguments[argumentIndex + 1].uppercased()
        }

        if arguments.contains("-china_storefront") {
            return "CHN"
        }

        if arguments.contains("-FASTLANE_SNAPSHOT"),
           let preferredLanguage = Locale.preferredLanguages.first?.lowercased(),
           (preferredLanguage.hasPrefix("zh-hans") || preferredLanguage.hasPrefix("en-gb")) {
            return "CHN"
        }

        return nil
    }
}
