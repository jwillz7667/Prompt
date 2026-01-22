//
//  KeychainHelper.swift
//  PromptKeyboard
//
//  Keychain helper with App Group access for sharing tokens from main app
//

import Foundation
import Security

enum KeychainHelper {
    // MARK: - Constants

    // Must match the main app's SharedKeychainHelper
    private static let teamId = "487LC4H9U4"
    private static let accessGroup = "\(teamId).group.com.res.promptomizer"

    // MARK: - Keys

    enum Key: String {
        case accessToken
        case refreshToken
    }

    // MARK: - Load

    static func load(key: Key) -> String? {
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

    // MARK: - Check Authentication

    static var hasValidTokens: Bool {
        load(key: .accessToken) != nil
    }

    // MARK: - Get Access Token

    static var accessToken: String? {
        load(key: .accessToken)
    }

    static var refreshToken: String? {
        load(key: .refreshToken)
    }
}
