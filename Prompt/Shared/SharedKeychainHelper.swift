//
//  SharedKeychainHelper.swift
//  Prompt
//
//  Keychain helper with App Group access for sharing tokens across main app and extensions.
//  Tokens persist across app updates by using kSecAttrAccessibleAfterFirstUnlock (not ThisDeviceOnly)
//  which survives app updates and device restores.
//

import Foundation
import Security

enum SharedKeychainHelper {
    // MARK: - Constants

    // App Group identifier - must match entitlements
    private static let appGroupId = "group.com.res.promptomizer"
    private static let serviceName = "com.res.promptomizer"

    // Team ID for keychain access group (matches $(AppIdentifierPrefix) in entitlements)
    private static let teamId = "487LC4H9U4"
    private static let accessGroup = "\(teamId).\(appGroupId)"

    // MARK: - Keys

    enum Key: String {
        case accessToken
        case refreshToken
    }

    // MARK: - Save

    nonisolated static func save(key: Key, value: String) {
        guard let data = value.data(using: .utf8) else {
            print("[Keychain] Failed to encode value for key: \(key.rawValue)")
            return
        }

        // First delete any existing item (from all possible locations)
        deleteAllVariants(key: key)

        // Add the new item with accessibility that survives app updates
        // Using kSecAttrAccessibleAfterFirstUnlock (NOT ThisDeviceOnly) so tokens
        // persist across app updates and can be restored from iCloud backup
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrService as String: serviceName,
            kSecAttrAccessGroup as String: accessGroup,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        if status == errSecSuccess {
            print("[Keychain] Saved \(key.rawValue) successfully")
        } else if status == errSecDuplicateItem {
            print("[Keychain] Duplicate item for \(key.rawValue), attempting update")
            // Try update instead
            let updateQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrAccount as String: key.rawValue,
                kSecAttrService as String: serviceName,
                kSecAttrAccessGroup as String: accessGroup
            ]
            let updateAttrs: [String: Any] = [
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
            ]
            let updateStatus = SecItemUpdate(updateQuery as CFDictionary, updateAttrs as CFDictionary)
            if updateStatus == errSecSuccess {
                print("[Keychain] Updated \(key.rawValue) successfully")
            } else {
                print("[Keychain] Update failed for \(key.rawValue): \(updateStatus)")
            }
        } else {
            print("[Keychain] Save error for \(key.rawValue): \(status) - \(securityErrorMessage(status))")
        }
    }

    // MARK: - Load

    nonisolated static func load(key: Key) -> String? {
        // Try loading from primary location first
        if let value = loadFromPrimary(key: key) {
            return value
        }

        // Try loading from legacy locations and migrate if found
        if let value = loadAndMigrateLegacy(key: key) {
            return value
        }

        return nil
    }

    private nonisolated static func loadFromPrimary(key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrService as String: serviceName,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecSuccess, let data = result as? Data {
            print("[Keychain] Loaded \(key.rawValue) from primary location")
            return String(data: data, encoding: .utf8)
        } else if status != errSecItemNotFound {
            print("[Keychain] Load error for \(key.rawValue): \(status) - \(securityErrorMessage(status))")
        }

        return nil
    }

    /// Attempts to load from legacy locations and migrates to primary if found
    private nonisolated static func loadAndMigrateLegacy(key: Key) -> String? {
        let legacyKey = key.rawValue

        // Try multiple legacy formats in order of likelihood
        let legacyLoaders: [(String, () -> String?)] = [
            // 1. With access group but no service (older SharedKeychainHelper format)
            ("accessGroup-noService", { loadLegacyWithAccessGroup(key: legacyKey) }),
            // 2. With ThisDeviceOnly accessibility (previous version)
            ("thisDeviceOnly", { loadLegacyThisDeviceOnly(key: key) }),
            // 3. Basic keychain without access group (oldest KeychainHelper format)
            ("basic", { loadLegacyBasic(key: legacyKey) }),
            // 4. With service but no access group
            ("service-noAccessGroup", { loadLegacyWithService(key: legacyKey) })
        ]

        for (location, loader) in legacyLoaders {
            if let value = loader() {
                print("[Keychain] Found \(key.rawValue) in legacy location: \(location), migrating...")
                // Save to primary location
                save(key: key, value: value)
                return value
            }
        }

        return nil
    }

    // MARK: - Delete

    nonisolated static func delete(key: Key) {
        deleteAllVariants(key: key)
        print("[Keychain] Deleted \(key.rawValue)")
    }

    /// Deletes from all possible keychain locations to ensure clean state
    private nonisolated static func deleteAllVariants(key: Key) {
        let keyName = key.rawValue

        // Primary location
        let primaryQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keyName,
            kSecAttrService as String: serviceName,
            kSecAttrAccessGroup as String: accessGroup
        ]
        SecItemDelete(primaryQuery as CFDictionary)

        // With access group, no service
        let accessGroupQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keyName,
            kSecAttrAccessGroup as String: accessGroup
        ]
        SecItemDelete(accessGroupQuery as CFDictionary)

        // Basic (no access group, no service)
        let basicQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keyName
        ]
        SecItemDelete(basicQuery as CFDictionary)

        // With service, no access group
        let serviceQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keyName,
            kSecAttrService as String: serviceName
        ]
        SecItemDelete(serviceQuery as CFDictionary)
    }

    // MARK: - Delete All

    nonisolated static func deleteAll() {
        print("[Keychain] Deleting all tokens")
        delete(key: .accessToken)
        delete(key: .refreshToken)
    }

    // MARK: - Check Authentication

    nonisolated static var hasValidTokens: Bool {
        load(key: .accessToken) != nil
    }

    // MARK: - Migration (called on app launch)

    nonisolated static func migrateFromLegacyKeychain() {
        print("[Keychain] Checking for legacy keychain items to migrate")

        // The load() function now handles migration automatically
        // Just attempt to load each key to trigger migration if needed
        _ = load(key: .accessToken)
        _ = load(key: .refreshToken)
    }

    // MARK: - Legacy Loaders

    private nonisolated static func loadLegacyBasic(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecSuccess, let data = result as? Data {
            // Delete from legacy location after successful read
            let deleteQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrAccount as String: key
            ]
            SecItemDelete(deleteQuery as CFDictionary)
            return String(data: data, encoding: .utf8)
        }
        return nil
    }

    private nonisolated static func loadLegacyWithAccessGroup(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecSuccess, let data = result as? Data {
            // Delete from legacy location
            let deleteQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrAccount as String: key,
                kSecAttrAccessGroup as String: accessGroup
            ]
            SecItemDelete(deleteQuery as CFDictionary)
            return String(data: data, encoding: .utf8)
        }
        return nil
    }

    private nonisolated static func loadLegacyWithService(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: serviceName,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecSuccess, let data = result as? Data {
            // Delete from legacy location
            let deleteQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrAccount as String: key,
                kSecAttrService as String: serviceName
            ]
            SecItemDelete(deleteQuery as CFDictionary)
            return String(data: data, encoding: .utf8)
        }
        return nil
    }

    /// Load from previous version that used ThisDeviceOnly accessibility
    private nonisolated static func loadLegacyThisDeviceOnly(key: Key) -> String? {
        // Query without specifying accessibility to find items with any accessibility
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrService as String: serviceName,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecSuccess,
           let dict = result as? [String: Any],
           let data = dict[kSecValueData as String] as? Data,
           let accessible = dict[kSecAttrAccessible as String] as? String {
            // Check if this item uses the old ThisDeviceOnly accessibility
            let thisDeviceOnlyValues = [
                kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String
            ]
            if thisDeviceOnlyValues.contains(accessible) {
                print("[Keychain] Found \(key.rawValue) with ThisDeviceOnly accessibility, will migrate")
                // Don't delete here - save() will handle deletion and re-creation with new accessibility
                return String(data: data, encoding: .utf8)
            }
        }
        return nil
    }

    // MARK: - Error Helpers

    private nonisolated static func securityErrorMessage(_ status: OSStatus) -> String {
        switch status {
        case errSecSuccess: return "Success"
        case errSecItemNotFound: return "Item not found"
        case errSecDuplicateItem: return "Duplicate item"
        case errSecAuthFailed: return "Authentication failed"
        case errSecInteractionNotAllowed: return "Interaction not allowed (device locked?)"
        case errSecMissingEntitlement: return "Missing entitlement"
        case errSecParam: return "Invalid parameter"
        default: return "Unknown error"
        }
    }
}
