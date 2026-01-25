1tf do9nt just make it otional # Production Readiness Setup Guide

This guide covers the remaining manual setup steps for production deployment.

## 1. Firebase Setup (iOS)

### Add Firebase SPM Packages

1. Open `Prompt.xcodeproj` in Xcode
2. Go to **File > Add Package Dependencies**
3. Enter URL: `https://github.com/firebase/firebase-ios-sdk`
4. Select version: **Up to Next Major** (11.0.0)
5. Add these products to the Prompt target:
   - `FirebaseAnalytics`
   - `FirebaseCrashlytics`

### Add GoogleService-Info.plist

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select existing
3. Add an iOS app with bundle ID: `com.res.promptomizer`
4. Download `GoogleService-Info.plist`
5. Drag into `Prompt/` folder in Xcode (check "Copy items if needed")

### Add Crashlytics Build Phase

1. Select the Prompt target in Xcode
2. Go to **Build Phases**
3. Click **+** > **New Run Script Phase**
4. Name it "Firebase Crashlytics"
5. Add this script:

```bash
"${BUILD_DIR%/Build/*}/SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/run"
```

6. Add input files:
   - `${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}`
   - `${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${PRODUCT_NAME}`
   - `${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Info.plist`
   - `$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/GoogleService-Info.plist`
   - `$(TARGET_BUILD_DIR)/$(EXECUTABLE_PATH)`

### Update ExportOptions.plist

Edit `Prompt/ExportOptions.plist` and replace `YOUR_TEAM_ID` with your Apple Developer Team ID.

---

## 2. GitHub Secrets Setup

Go to your GitHub repository > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**

### Backend (Railway)

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Get from Railway dashboard > Account Settings > Tokens |

### Web (Vercel)

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Get from Vercel > Settings > Tokens |
| `VERCEL_ORG_ID` | From `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` after `vercel link` |

To get Vercel IDs:
```bash
cd web
npm i -g vercel
vercel link
cat .vercel/project.json
```

### iOS (Code Signing)

| Secret | Description |
|--------|-------------|
| `BUILD_CERTIFICATE_BASE64` | Base64-encoded .p12 certificate |
| `P12_PASSWORD` | Password for the .p12 certificate |
| `PROVISIONING_PROFILE_BASE64` | Base64-encoded .mobileprovision file |

To encode certificate and profile:
```bash
# Export certificate from Keychain as .p12
base64 -i Certificates.p12 | pbcopy  # Copies to clipboard

# Export provisioning profile from ~/Library/MobileDevice/Provisioning\ Profiles/
base64 -i YourProfile.mobileprovision | pbcopy
```

---

## 3. Verification Checklist

### Backend
- [ ] Run `npm run dev` - check logs show JSON in production, pretty in dev
- [ ] Test webhook idempotency:
  ```bash
  # First request
  curl -X POST http://localhost:3000/api/v1/webhooks/appstore \
    -H "Content-Type: application/json" \
    -d '{"signedPayload": "test123"}'

  # Same request again - should return cached response
  curl -X POST http://localhost:3000/api/v1/webhooks/appstore \
    -H "Content-Type: application/json" \
    -d '{"signedPayload": "test123"}'
  ```

### iOS
- [ ] Build succeeds in Xcode
- [ ] PrivacyInfo.xcprivacy included in build (check in Organizer)
- [ ] Firebase initializes (check console for "[Analytics] Firebase configured successfully")
- [ ] Test crash reporting:
  ```swift
  // In DEBUG only - add button that calls:
  AnalyticsService.shared.forceCrash()
  ```
- [ ] Verify crash appears in Firebase Console

### GitHub Actions
- [ ] Push to `backend/**` triggers backend workflow
- [ ] Push to `web/**` triggers web workflow
- [ ] Push to `Prompt/**` triggers iOS workflow
- [ ] All workflows pass on PR

---

## 4. Environment Variables Reference

### Backend (.env)

```env
# Existing vars...

# Logging (optional)
LOG_LEVEL=debug  # trace, debug, info, warn, error, fatal
NODE_ENV=development  # development, production, test
```

---

## 5. Monitoring Dashboards

After setup, monitor your app at:

- **Firebase Console**: https://console.firebase.google.com
  - Crashlytics: Real-time crash reports
  - Analytics: User events and engagement

- **Railway**: https://railway.app
  - Logs: Structured JSON logs from Pino
  - Metrics: CPU, memory, requests

- **Vercel**: https://vercel.com
  - Analytics: Web vitals and traffic
