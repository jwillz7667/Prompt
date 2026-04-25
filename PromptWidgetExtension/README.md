# PromptWidgetExtension

Home-screen widgets, lock-screen widgets, and Live Activities for the Promptomize iOS
app. Built with WidgetKit and ActivityKit.

> For repository-wide context, see [`../README.md`](../README.md).
> For iOS app conventions, see [`../Prompt/README.md`](../Prompt/README.md).

---

## What ships

| Widget / Activity | File | Family |
|-------------------|------|--------|
| Quick Enhance widget | `QuickEnhanceWidget.swift` | systemSmall, systemMedium, accessoryRectangular, accessoryCircular |
| Quota widget | `QuotaWidget.swift` | systemSmall, accessoryCircular |
| Enhancement Live Activity | `EnhancementLiveActivity.swift` | Lock Screen + Dynamic Island (compact, expanded, minimal) |

The widget bundle is registered in `PromptWidgetExtensionBundle.swift`.

---

## Shared state

Widgets do not run as part of the main app process. They read state via:

- **App Group:** `group.com.res.promptomizer` for non-secret state (subscription tier,
  daily quota progress, last enhancement time).
- **Shared Keychain:** for the JWT pair, so the widget can call the backend if it needs
  fresh data.

Both contracts are defined in `../Prompt/Shared/` and consumed identically here.
**Any change to the shared schema must be deployed simultaneously to all targets** —
the widget extension cannot fall back gracefully if it disagrees with the main app.

---

## Configuration

### App Group

1. Main `Prompt` target → Signing & Capabilities → App Groups → `group.com.res.promptomizer`.
2. `PromptWidgetExtension` target → same group.

### Keychain Sharing

1. Main `Prompt` target → Keychain Sharing → `487LC4H9U4.group.com.res.promptomizer`.
2. `PromptWidgetExtension` target → same access group.

### Privacy Manifest

Each extension ships its own [`PrivacyInfo.xcprivacy`](./PrivacyInfo.xcprivacy). Update
it whenever data-collection or required-reasons API usage changes.

---

## Live Activity contract

The main app starts an `EnhancementLiveActivity` when the user kicks off a long-running
enhancement, then updates it as the backend streams progress over SSE. The activity
ends when the enhancement completes or fails.

The live activity payload is defined in `EnhancementLiveActivity.swift` and consumed
identically by the Dynamic Island and Lock Screen presentations. The main app uses
`Activities/` (in the main target) to begin and update activities; this extension only
renders.

---

## Local testing

1. Run the main `Prompt` scheme on a simulator or device.
2. Long-press the home screen → tap the **+** → search "Promptomize" → add the widget.
3. For Live Activities, trigger an enhancement long enough to outlive the screen
   sequence — usually 3+ seconds — and observe the Lock Screen + Dynamic Island.

The Xcode preview canvas works for layout-only iteration without the parent app.

---

## Constraints

- **Memory budget:** widgets get ~30 MB. Avoid heavy SwiftData queries or image
  rendering. Use shared `UserDefaults` snapshots written by the main app instead.
- **Network:** allowed but rare. The host system aggregates timeline reloads — never
  call the backend on every render.
- **Animations:** use `.animation` sparingly. Lock-screen widgets in particular have
  strict refresh rules.
- **Refresh budget:** WidgetCenter timeline reloads are budgeted by iOS. Trigger them
  from the main app on meaningful state changes, not on a polling loop.
