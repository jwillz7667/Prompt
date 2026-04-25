# Promptomize iOS

The native iOS app — SwiftUI + Swift 6, with widget and keyboard extensions, Live
Activities, and SwiftData-backed local history.

[![iOS CI/CD](https://github.com/jwillz7667/Prompt/actions/workflows/ios.yml/badge.svg)](../.github/workflows/ios.yml)
[![Swift](https://img.shields.io/badge/Swift-6-FA7343?logo=swift&logoColor=white)](./PromptApp.swift)
[![iOS](https://img.shields.io/badge/iOS-17%2B-000000?logo=apple&logoColor=white)](./Info.plist)
[![App Store](https://img.shields.io/badge/App%20Store-Promptomize-0D96F6?logo=apple&logoColor=white)](https://apps.apple.com/us/app/promptomize/id6758075605)

> For repository-wide context, see [`../README.md`](../README.md).
> For architecture and data flows across all surfaces, see [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## Contents

1. [Stack](#stack)
2. [Targets](#targets)
3. [Project layout](#project-layout)
4. [Getting started](#getting-started)
5. [Build & run](#build--run)
6. [Conventions](#conventions)
7. [Authentication & shared state](#authentication--shared-state)
8. [Subscriptions](#subscriptions)
9. [Telemetry & privacy](#telemetry--privacy)
10. [Testing](#testing)
11. [Release process](#release-process)

---

## Stack

| Concern | Choice |
|---------|--------|
| Language | Swift 6 (strict concurrency) |
| UI | SwiftUI + WidgetKit + ActivityKit |
| Persistence | SwiftData + shared Keychain |
| Networking | `actor APIClient` (URLSession + automatic JWT refresh) |
| Auth | Apple Sign-In + Google Sign-In |
| Subscriptions | StoreKit 2 |
| Telemetry | Firebase Analytics + Crashlytics (no PII) |
| Realtime | Socket.IO via `SupportSocketManager` |
| Streaming | Server-Sent Events (SSE) for prompt enhancement |

Bundle ID: `com.res.promptomizer` · App Group: `group.com.res.promptomizer` ·
URL scheme: `promptomize://`.

---

## Targets

| Target | Path | Role |
|--------|------|------|
| `Prompt` (main app) | `Prompt/` | iPhone + iPad app |
| `PromptWidgetExtension` | `../PromptWidgetExtension/` | Home-screen widgets, lock-screen widgets, Live Activities |
| `PromptKeyboard` | `../PromptKeyboard/` | Custom keyboard extension |
| `PromptUITests` | `../PromptUITests/` | XCUITest snapshot tests driven by Fastlane |

All extensions share auth and state with the main app via the App Group
`group.com.res.promptomizer` and the shared Keychain access group.

---

## Project layout

```
Prompt/
├── PromptApp.swift               @main entry point + RootView + SplashView
├── ContentView.swift             Top-level routing between authenticated and guest UIs
├── Info.plist                    App metadata, URL types, background modes
├── Prompt.entitlements           App Group, Keychain Sharing, StoreKit, Push, Sign-In with Apple
├── PrivacyInfo.xcprivacy         Apple Privacy Manifest (data-collection declarations)
├── GoogleService-Info.plist      Firebase configuration (gitignored if real keys)
│
├── Configuration/                Build configuration files
├── Theme/                        Liquid-Glass design tokens, adaptive colors
├── Assets.xcassets               App icon, accent color, illustrations
│
├── Models/
│   ├── ContextModels.swift       Reusable project-context DTOs
│   ├── LocalPromptRecord.swift   SwiftData @Model for offline history
│   ├── PlatformModels.swift      Platform / preset DTOs
│   ├── PromptImageAttachment.swift
│   ├── SandboxModels.swift       Multi-platform sandbox DTOs
│   ├── SubscriptionModels.swift  StoreKit + tier DTOs
│   ├── ThreadModels.swift        Multi-turn thread DTOs
│   └── WorkflowModels.swift      Multi-step workflow DTOs
│
├── ViewModels/
│   ├── PromptViewModel.swift     Single-turn enhance flow
│   └── ThreadViewModel.swift     Multi-turn streaming + history sync
│
├── Views/
│   ├── ThreadView.swift          Primary chat surface (~74k LoC, broken into sub-views)
│   ├── HistoryView.swift         Saved prompts list + filters
│   ├── ProfileView.swift         Account, settings, subscription status
│   ├── PaywallView.swift         StoreKit-driven paywall
│   ├── SandboxView.swift         Run a single prompt across N platforms
│   ├── WorkflowsView.swift       Multi-step workflow builder
│   ├── VariationsView.swift      A/B variation generator
│   ├── ContextsView.swift        Reusable project-context manager
│   ├── CollectionsView.swift     Folder organisation
│   ├── PlatformOptimizationView.swift
│   ├── AnalyticsView.swift
│   ├── SupportView.swift         Ticketed chat support
│   ├── AuthView.swift            Apple/Google sign-in
│   ├── ThreadListView.swift      Thread switcher
│   └── WhatsNewView.swift        Release-notes sheet
│
├── Components/                   Reusable SwiftUI building blocks (~14 files)
├── Activities/                   ActivityKit Live Activities (enhancement progress)
├── Intents/                      App Intents for Siri / Shortcuts
├── Services/                     ~26 service classes (see below)
└── Shared/                       Code shared with extensions (Keychain, App Group, types)
```

### Services overview

`Services/` houses the platform layer:

- `APIClient.swift` — `actor` providing the only blessed path to the backend, with
  automatic JWT refresh on 401.
- `AuthManager.swift` — Apple/Google sign-in, session lifecycle, shared Keychain writes.
- `StoreKitManager.swift` — StoreKit 2 product loading, purchase, transaction
  verification (calls `/api/v1/subscriptions/verify-purchase`), entitlement caching.
- `SettingsManager.swift` — User-facing app settings and feature toggles.
- `PromptHistoryManager.swift` — In-memory + SwiftData-backed prompt history.
- `SwiftDataManager.swift` — SwiftData container bootstrap and migrations.
- `SyncManager.swift` — Backend ↔ local cloud sync.
- `NotificationManager.swift` — APNs registration and routing.
- `SupportSocketManager.swift` — Socket.IO client for live support chat.
- `AnalyticsService.swift` — Firebase Analytics wrapper (no PII).
- `ErrorHandler.swift` — Centralised user-facing error mapping.
- `DeeplinkManager.swift`, `ShareService.swift`, `BackgroundTaskManager.swift`,
  `ThreadSyncBroadcaster.swift`, `GuestSessionManager.swift`,
  `AppStoreComplianceManager.swift`, `ContextService.swift`, `PlatformService.swift`,
  `SandboxService.swift`, `VariationsService.swift`, `WorkflowService.swift`,
  `ImageAttachmentProcessor.swift`, and provider-specific helpers.

---

## Getting started

```bash
# From the repository root
open Prompt.xcodeproj
# In Xcode: select the Prompt scheme + an iPhone 16 / iPhone 16 Pro simulator → Cmd+R
```

The app will run against the production backend by default
(`https://backend-production-d538.up.railway.app/api/v1`). To target a local backend:

1. Edit `Prompt/Services/APIClient.swift` `baseURL` for ad-hoc work, or
2. Add a local `.xcconfig` (gitignored) overriding the configured base URL.

---

## Build & run

```bash
# Headless build for a simulator
xcodebuild -scheme Prompt \
           -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
           -configuration Debug build

# Archive for the App Store
xcodebuild archive -scheme Prompt \
                   -archivePath ./build/Prompt.xcarchive \
                   -destination 'generic/platform=iOS' \
                   -configuration Release

# Export an .ipa using the committed export options
xcodebuild -exportArchive \
           -archivePath ./build/Prompt.xcarchive \
           -exportPath ./build/export \
           -exportOptionsPlist ../ExportOptions.plist
```

Fastlane wraps these commands in higher-level lanes — see
[`../fastlane/Fastfile`](../fastlane/Fastfile).

---

## Conventions

The full set lives in [`../CLAUDE.md`](../CLAUDE.md). Highlights:

- **MVVM + `@Observable`.** ViewModels are `@MainActor` classes. Views are structs.
- **Value types first.** Use `struct` and `enum` unless reference semantics matter.
- **`guard let`** for early returns, **`if let`** for inline binding.
- **Booleans named as questions** — `isLoading`, `hasCompleted`, `shouldRetry`.
- **Errors** are enums conforming to `LocalizedError`.
- **Concurrency** uses `async/await` and structured concurrency. No completion handlers
  in new code.
- **Networking** goes through `actor APIClient`. Never instantiate a one-off
  `URLSession`.

Style is enforced via [`../.swiftformat`](../.swiftformat) and
[`../.swiftlint.yml`](../.swiftlint.yml). Run them locally before opening a PR:

```bash
brew install swiftformat swiftlint
swiftformat .
swiftlint
```

---

## Authentication & shared state

Auth state must be shared across the main app, widget extension, and keyboard extension:

- Tokens are written to the **shared Keychain** access group.
- Non-secret state (subscription tier, feature flags, last sync time) is written via
  `SharedDataManager` to the App Group `group.com.res.promptomizer`.
- Any change to token storage, Keychain key names, or App Group keys **must** be made
  simultaneously in all three targets — they are runtime contracts, not abstractions.

---

## Subscriptions

- `StoreKitManager.swift` is the single source of truth for product loading, purchase,
  refund detection, and entitlement caching.
- After a successful StoreKit transaction, the app calls
  `POST /api/v1/subscriptions/verify-purchase` with the JWS payload. The backend
  verifies with Apple and returns the canonical `Subscription` row.
- Apple App Store Server Notifications are received by the **backend** webhook with
  idempotent processing — never trust client state alone.

---

## Telemetry & privacy

- **Firebase Analytics + Crashlytics.** No PII is logged. Avoid logging prompt content
  or any user-identifying data.
- **Apple Privacy Manifest** declared in [`PrivacyInfo.xcprivacy`](./PrivacyInfo.xcprivacy)
  per Apple's data-collection rules. The widget extension has its own manifest.
- **App Tracking Transparency** is **not** required (we do not track users across
  third-party apps and websites).
- **Sign-in-required content** is gated by `AuthManager.isAuthenticated`. The IAP flow
  is intentionally reachable without sign-in (per App Store guideline 5.1.1(v)).

---

## Testing

- `PromptUITests/` runs XCUITest snapshot tests via Fastlane (`fastlane snapshot`).
- The CI workflow ([`../.github/workflows/ios.yml`](../.github/workflows/ios.yml)) runs
  the test step with `continue-on-error: true` because we do not yet have a unit-test
  framework wired up. Manual verification is required for non-trivial changes.

---

## Release process

See [`../CONTRIBUTING.md` § Release Process](../CONTRIBUTING.md#9-release-process) and
[`../CHANGELOG.md`](../CHANGELOG.md). In short:

1. Bump `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `Prompt.xcodeproj`.
2. Add release notes under a new `## [X.Y.Z]` heading in `CHANGELOG.md`.
3. Open a `chore: release vX.Y.Z` PR; tag `vX.Y.Z` on `main` after merge.
4. `fastlane release` (or trigger the iOS workflow) to upload to TestFlight.
5. Submit for App Review.

App Store metadata constraints to remember:

- **No third-party AI brand names** in metadata, screenshots, or copy. Use generic
  terms ("AI models", "language models"). Regional reviewers (notably China) reject
  for this.
- **EULA link** must be present in the App Store description.
- **App icons** must not contain an alpha channel.
