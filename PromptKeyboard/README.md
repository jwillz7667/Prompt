# PromptKeyboard Extension

Custom keyboard extension for quick prompt enhancement directly from any app.

## Setup Instructions

### 1. Add Keyboard Extension Target in Xcode

1. Open `Prompt.xcodeproj` in Xcode
2. File → New → Target
3. Select "Keyboard Extension"
4. Name: `PromptKeyboard`
5. Bundle Identifier: `com.res.promptomizer.PromptKeyboard`
6. Embed in Application: `Prompt`

### 2. Configure Files

After creating the target, replace the generated files with these:

- Replace `KeyboardViewController.swift` with the one in this folder
- Replace `Info.plist` with the one in this folder
- Add `KeychainHelper.swift` and `SharedDataManager.swift` to the target

### 3. Configure App Groups

1. Select the main `Prompt` target
2. Signing & Capabilities → + Capability → App Groups
3. Add group: `group.com.res.promptomizer`

4. Select the `PromptKeyboard` target
5. Signing & Capabilities → + Capability → App Groups
6. Add the same group: `group.com.res.promptomizer`

### 4. Configure Keychain Sharing

1. Select the main `Prompt` target
2. Signing & Capabilities → + Capability → Keychain Sharing
3. Add: `487LC4H9U4.group.com.res.promptomizer`

4. Select the `PromptKeyboard` target
5. Signing & Capabilities → + Capability → Keychain Sharing
6. Add the same: `487LC4H9U4.group.com.res.promptomizer`

### 5. Build & Test

1. Build and run the main app first
2. Sign in to your account
3. Go to Settings → General → Keyboard → Keyboards → Add New Keyboard
4. Select "Promptomize"
5. Enable "Allow Full Access" (required for network requests)

## Features

- **Quick Enhance**: Paste or type a prompt and tap Enhance
- **Insert Result**: Tap Insert to add enhanced prompt to any text field
- **Preferences Sync**: Uses your tone, length, and custom instruction preferences from the main app
- **Secure Auth**: Uses shared keychain for secure token access

## Architecture

- `KeyboardViewController.swift`: Main keyboard UI and logic
- `KeychainHelper.swift`: Read-only access to shared keychain tokens
- `SharedDataManager.swift`: Access to shared preferences via App Group

## Security Notes

- Auth tokens are stored in shared keychain (secure)
- Preferences are stored in App Group UserDefaults (non-sensitive)
- Network requests use HTTPS
- "Allow Full Access" is required for API calls
