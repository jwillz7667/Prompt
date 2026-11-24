# Promptomize iOS audit (2026-11-21)

Scope: the iOS app, widget extension and intents on `codex/audit-subscriptions-ai` (PR #52, head `2846d5d`). That branch, not `main`, produced version 2.1.0 (build 2026.11.10). The public App Store lookup shows 2.1.0 live since Nov 11.

Method: static review of the Swift source, project settings, entitlements, Info.plist, StoreKit config and fastlane metadata, plus the latest CI log for this branch and live checks of the API and legal pages. I could not run the app on a device or simulator from this environment, so anything marked "verify on device" is unconfirmed.

## Bottom line

The app builds in CI and the new Railway backend is healthy. The core loop (type a prompt, get an optimized one, keep chatting) is solid. The real problems: the App Store listing sells features the app does not show, a guest could get stuck on a sign-in screen with no exit, there are two different "7-day trials", and new users land on a blank screen with no explanation.

## Verified working

| Check | Result |
| :-- | :-- |
| iOS CI on PR #52 (simulator build + config/subscription checks) | Pass |
| Backend `GET /health` on `backend-production-d7487` | `healthy`; database, Redis, queues and migrations OK |
| `promptomize.app/terms`, `/privacy`, `/support` | 200 |
| `promptomize://` URL scheme used by widgets | Registered in Info.plist |
| PR #52 mergeability | Mergeable, clean |

## Fixed on branch `audit/ux-fixes-2026-11-21` (commit `e328a30`)

| # | Problem | Fix |
| :-- | :-- | :-- |
| 1 | A signed-out user who tapped Send got a full-screen sign-in cover with no close button and `interactiveDismissDisabled(true)`. Cancelling the Apple sheet left them stuck until they force-quit. | Close button in both modes, labelled "Not now" for VoiceOver. Their draft stays in the composer. |
| 2 | The same tap also raised an error alert ("Sign in with Apple to start…") at the same moment as the cover. Only one can present, and it framed a normal step as a failure. | `.requiresAuthentication` returns quietly and lets the cover show. |
| 3 | First launch after sign-in fired the system notification prompt before the user had done anything. | Prompt after the first successful result instead. Users who already answered just get their APNs token refreshed. |
| 4 | Tapping a support-reply or "enhancement complete" notification did nothing: one handler set an unused `@State`, the other only printed. | Support replies open Profile (Contact Support is there); completed prompts open the chat sidebar. |
| 5 | Home is a blank canvas with a text field. New users have to guess what the app does or what Optimize and Chat mean. | Short empty-state header that changes with the mode. |
| 6 | Header icon buttons (menu, new chat, profile) had no accessibility labels. | Labelled. |
| 7 | The chat drawer is 82% of the screen width. On a 13" iPad that is about 1,100pt. | Capped at 380pt. |
| 8 | `Info.plist` pointed `UILaunchStoryboardName` at `LaunchScreen`, which does not exist in the project. | Removed. `INFOPLIST_KEY_UILaunchScreen_Generation` already supplies the launch screen. |
| 9 | The **live** App Store description (US, UK and China storefronts) says users can "reuse project context" and "organize prompts in collections, and favorite the ones you use most". None of these can be reached anywhere in the iOS UI (details below). The repo's `fastlane/metadata` was also an older, different text than what is live. | Replaced the repo descriptions with the current live text minus those two claims, so the next `fastlane deliver` fixes the listing instead of reverting it. |

### Follow-up commit `cfb40f7`

| # | Problem | Fix |
| :-- | :-- | :-- |
| 10 | Two 7-day trials with opposite terms (server "no payment" trial vs Apple's auto-renewing intro offer). | Apple trial only. The server trial banner and its call path are gone. Product cards show "7 days free" only when StoreKit says the Apple ID is eligible, the button reads "Start Free Trial", and the exact terms sit under it. |
| 11 | Too many automatic popups, and they could stack. | One gate for every automatic popup: at most one per app session, never on top of another sheet or while a reply streams. Guest sign-in now sends the waiting prompt instead of opening a paywall. The plan intro shows once, after the second result. Daily free-plan paywall is now weekly. Review prompt after 5 results, at most every 30 days. |
| 12 | About 7,850 lines of screens nothing presents, plus a `PromptKeyboard/` folder that was never a target. | Deleted after a symbol scan confirmed nothing kept, including the widget and UI tests, references them. |

iOS CI (simulator build and subscription checks) passed on PR #53 with these commits.

## Must fix (not changed, needs your call)

### 1. Push the corrected description
The live listing still promises project context, collections and favorites. Users who download for those features cannot find them, and the next review can flag it under Guideline 2.3.1 (accurate metadata). Run the metadata lane from this branch (or paste `fastlane/metadata/*/description.txt` into App Store Connect) with the next version. Alternatively, ship the Contexts and Collections screens (see P1 item 4) and keep the copy.

### 2. Confirm the Apple intro offer in App Store Connect
The app now relies only on Apple's free introductory offer. `Products.storekit` has a 1-week free offer on both Premium products; confirm the same offer is live on both products in App Store Connect, or the trial label simply will not appear. The web app still uses the server trial endpoint; that is unchanged.

### 3. Merge PR #52
`main` is still on the September code pointing at the old backend (`backend-production-d538`, which now returns 404). The scheduled Uptime Monitor on `main` checks the old URL and stopped running after Sept 18. It will use the new URL once #52 merges.

## UX improvements, in priority order

### P1: these make the app harder to use

1. ~~Sign-in interrupts the first prompt twice.~~ Fixed in `cfb40f7`.
2. ~~Too many automatic sheets.~~ Fixed in `cfb40f7`.
3. **Chats disappear after 5 minutes in the background.** `handleScenePhaseChange` starts a new conversation with no message. The chat is still in the sidebar, but users will think it was lost. Show a one-line "Started a new chat. Your last one is in the menu." or keep the last chat open.
4. ~~Unreachable screens.~~ Deleted in `cfb40f7`. Services and models that only those screens used (`WorkflowService`, `SandboxService`, `ContextService`, `PlatformService`, `ShareService`, `EnhancementActivityManager`) are still compiled; they can go in a follow-up. If you want Contexts or Collections back, the backend routes are intact.

### P2: clarity and polish

5. **No localization at all.** There is no string catalog, yet the store listing is also in Simplified Chinese. Chinese users get an all-English app. Either localize or drop the zh-Hans listing.
6. **Dead capabilities.** The Live Activity was only started from `PromptViewModel` (now deleted), so it never runs while `NSSupportsLiveActivities` is on. The entitlements include Apple Pay (`in-app-payments` merchant) and a CloudKit container, but the app uses neither. Unused capabilities invite App Review questions.
7. **iPad is a stretched phone.** The drawer cap helps, but iPad would be much easier with a `NavigationSplitView` (chats on the left, thread on the right).
8. **48 `print` calls outside `#if DEBUG`**, several logging auth/session state. Move them to `Logger` or gate them.

### P3: code health

9. Swift 6 warnings: `EnhancePromptIntentRequest/Response` Codable conformances used from the intent, and `StoreKitManager.PurchaseSyncOutcome: Equatable` used off the main actor. Mark those types `nonisolated`.
10. `UIScreen.main` (deprecated) still sizes the drawer; switch to a `GeometryReader` or `containerRelativeFrame` when you redo iPad.

## How to ship the fixes

1. Push `audit/ux-fixes-2026-11-21` (stacked on PR #52) and open a PR into `codex/audit-subscriptions-ai`, or into `main` after #52 merges.
2. Let iOS CI build it.
3. On a device: sign out, type a prompt, tap Send, close the sign-in screen and confirm the draft is still there; sign in and confirm no alert appears behind the cover; run one prompt and confirm the notification prompt appears after the result.
