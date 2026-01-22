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

    // MARK: - Keys

    enum Key: String {
        case accessToken
        case refreshToken
    }

    // MARK: - Save

    nonisolated static func save(key: Key, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrAccessGroup as String: accessGroup,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        // Delete any existing item first
        SecItemDelete(query as CFDictionary)

        // Add the new item
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess && status != errSecDuplicateItem {
            print("SharedKeychain save error: \(status)")
        }
    }

    // MARK: - Load

    nonisolated static func load(key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
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

    // MARK: - Delete

    nonisolated static func delete(key: Key) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrAccessGroup as String: accessGroup
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Delete All

    nonisolated static func deleteAll() {
        delete(key: .accessToken)
        delete(key: .refreshToken)
    }

    // MARK: - Check Authentication

    nonisolated static var hasValidTokens: Bool {
        load(key: .accessToken) != nil
    }

    // MARK: - Migration

    nonisolated static func migrateFromLegacyKeychain() {
        // Try to load from legacy keychain (without access group)
        if let accessToken = loadLegacy(key: "accessToken") {
            save(key: .accessToken, value: accessToken)
            deleteLegacy(key: "accessToken")
        }

        if let refreshToken = loadLegacy(key: "refreshToken") {
            save(key: .refreshToken, value: refreshToken)
            deleteLegacy(key: "refreshToken")
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
}
