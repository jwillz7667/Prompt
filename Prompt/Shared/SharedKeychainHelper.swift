//
//  SharedKeychainHelper.swift
//  Prompt
//
//  Keychain helper with App Group access for sharing tokens across main app and extensions
//

import Foundation
import Security

enum SharedKeychainHelper {
    // MARK: - Constants

    private static let teamId = "487LC4H9U4"
    private static let accessGroup = "\(teamId).group.com.res.promptomizer"
    private static let serviceName = "com.res.promptomizer"

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

        // First delete any existing item
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrService as String: serviceName,
            kSecAttrAccessGroup as String: accessGroup
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add the new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrService as String: serviceName,
            kSecAttrAccessGroup as String: accessGroup,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
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
                kSecValueData as String: data
            ]
            let updateStatus = SecItemUpdate(updateQuery as CFDictionary, updateAttrs as CFDictionary)
            if updateStatus != errSecSuccess {
                print("[Keychain] Update failed for \(key.rawValue): \(updateStatus)")
            }
        } else {
            print("[Keychain] Save error for \(key.rawValue): \(status)")
        }
    }

    // MARK: - Load

    nonisolated static func load(key: Key) -> String? {
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
            print("[Keychain] Loaded \(key.rawValue) successfully")
            return String(data: data, encoding: .utf8)
        } else if status == errSecItemNotFound {
            print("[Keychain] No item found for \(key.rawValue)")
        } else {
            print("[Keychain] Load error for \(key.rawValue): \(status)")
        }

        return nil
    }

    // MARK: - Delete

    nonisolated static func delete(key: Key) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrService as String: serviceName,
            kSecAttrAccessGroup as String: accessGroup
        ]
        let status = SecItemDelete(query as CFDictionary)
        print("[Keychain] Deleted \(key.rawValue): \(status == errSecSuccess || status == errSecItemNotFound ? "OK" : "Error \(status)")")
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

    // MARK: - Migration

    nonisolated static func migrateFromLegacyKeychain() {
        print("[Keychain] Checking for legacy keychain items to migrate")

        // Try to load from legacy keychain (without access group/service)
        if let accessToken = loadLegacy(key: "accessToken") {
            print("[Keychain] Migrating legacy accessToken")
            save(key: .accessToken, value: accessToken)
            deleteLegacy(key: "accessToken")
        }

        if let refreshToken = loadLegacy(key: "refreshToken") {
            print("[Keychain] Migrating legacy refreshToken")
            save(key: .refreshToken, value: refreshToken)
            deleteLegacy(key: "refreshToken")
        }

        // Also try with the old service name pattern
        if let accessToken = loadLegacyWithService(key: "accessToken") {
            print("[Keychain] Migrating old service accessToken")
            save(key: .accessToken, value: accessToken)
            deleteLegacyWithService(key: "accessToken")
        }

        if let refreshToken = loadLegacyWithService(key: "refreshToken") {
            print("[Keychain] Migrating old service refreshToken")
            save(key: .refreshToken, value: refreshToken)
            deleteLegacyWithService(key: "refreshToken")
        }
    }

    // MARK: - Legacy Helpers (for migration)

    private nonisolated static func loadLegacy(key: String) -> String? {
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

    private nonisolated static func deleteLegacy(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    private nonisolated static func loadLegacyWithService(key: String) -> String? {
        // Try loading with access group but without service name
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: accessGroup,
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

    private nonisolated static func deleteLegacyWithService(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: accessGroup
        ]
        SecItemDelete(query as CFDictionary)
    }
}
