# Security Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use systematic-debugging before each fix: reproduce/confirm the issue, add a regression test or harness, implement the smallest safe fix, verify, then request code review.

**Goal:** Comprehensively fix the immediate security concerns and app-breaking bugs found in the quick audit across backend, web, and iOS.

**Architecture:** Treat security fixes as production incidents: first close exploitable gaps, then add regression tests, then harden abuse controls and dependency posture. Prefer server-side trust boundaries, signed/verifiable webhooks, HttpOnly token handling, authenticated Socket.IO rooms, and atomic quota/rate-limit enforcement.

**Tech Stack:** Node/Express/TypeScript, Prisma/PostgreSQL, Redis, Socket.IO, Next.js App Router, Stripe, Resend/Svix webhooks, SwiftUI/StoreKit 2/Keychain.

---

## Operating Rules

1. Create one branch: `fix/security-remediation`.
2. Do not mix refactors with fixes.
3. Every exploitable bug gets either a unit/integration test or a small reproducible script.
4. Commit after each completed task group.
5. Run the affected build/tests after each group.
6. Run final independent code review before merge.
7. Deploy backend first for server-side protections, then web, then iOS release changes.

---

## Phase 0: Baseline and Safety Checks

### Task 0.1: Capture baseline status

**Objective:** Know current build/test/audit state before changing code.

**Commands:**

```bash
cd /Users/willz/ai/Prompt
git status --short

cd backend
npm run build
npx prisma migrate status
npm audit --omit=dev --json > ../security-audit-backend-before.json || true

cd ../web
npm run build
npm audit --omit=dev --json > ../security-audit-web-before.json || true
```

**Expected:** Backend build passes. Prisma schema is up to date. Audit files are generated even if npm exits non-zero.

**Commit:** Do not commit audit JSON unless intentionally tracking audit artifacts.

---

## Phase 1: Close Critical Backend Exploits

### Task 1.1: Require and verify Resend/Svix webhook signatures

**Severity:** Critical

**Objective:** Prevent forged inbound support-ticket email events.

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/webhooks.ts:245-276`
- Test: `backend/src/routes/__tests__/webhooks.resend.test.ts` or existing test location if present

**Current bug:** `RESEND_WEBHOOK_SECRET` is optional and `svix-signature` is only checked for presence, not cryptographically verified.

**Implementation approach:**
1. Ensure raw body is captured for `/api/v1/webhooks/resend/inbound`, similar to current api-stripe raw body handling.
2. Install/use Svix verification if not already present via Resend dependency, or add `svix` directly.
3. In production, fail startup or fail request if `RESEND_WEBHOOK_SECRET` is missing.
4. Verify `svix-id`, `svix-timestamp`, and `svix-signature` against raw body.
5. Reject invalid signatures with 401/400.
6. Add sender/recipient allowlist checks if support inbound should only accept known support mailbox routes.
7. Reconsider `addAgentReplyToTicket`: inbound customer replies should likely be user/customer replies unless sender is a trusted support address.

**Regression tests:**
- Missing signature returns 401.
- Invalid signature returns 401/400.
- Valid signed webhook with unknown ticket returns safe 200 ignored or 404-equivalent response.
- Valid signed webhook with known ticket creates exactly one message.
- Unsigned forged webhook does not create a message.

**Verification:**

```bash
cd /Users/willz/ai/Prompt/backend
npm run build
npm test -- webhooks.resend --runInBand || true
```

If no test runner exists, add a small integration script or Supertest setup before implementation.

**Commit:**

```bash
git add backend/src/index.ts backend/src/routes/webhooks.ts backend/src/routes/__tests__
git commit -m "fix: verify Resend inbound webhook signatures"
```

### Task 1.2: Authenticate Socket.IO ticket room joins

**Severity:** Critical

**Objective:** Prevent unauthorized users from joining support ticket rooms.

**Files:**
- Modify: `backend/src/utils/socket.ts:54-78`
- Possibly modify/export helper from: `backend/src/utils/jwt.ts`
- Possibly use: `backend/src/utils/prisma.ts`
- Test: `backend/src/utils/__tests__/socket.test.ts` or integration test

**Current bug:** Any socket can join `ticket:${ticketId}` as role `user` without proving ownership.

**Implementation approach:**
1. Require auth token in Socket.IO handshake: `socket.handshake.auth.token` or Authorization header.
2. Validate JWT and load authenticated user.
3. For `role === 'user'`, query `supportTicket.findFirst({ where: { id: ticketId, userId } })` before joining.
4. For `role === 'agent'`, require admin credential and never trust user-supplied role alone.
5. Store server-derived `socket.data.userId` and `socket.data.role`.
6. For `typing:start` and `typing:stop`, ignore client role and ticketId unless the socket already joined that ticket.
7. Return explicit `ticket:error` on unauthorized join.

**Regression tests:**
- No token cannot join ticket.
- User token cannot join another user’s ticket.
- User token can join own ticket.
- Invalid admin key cannot join as agent.
- Valid admin key can join as agent.
- Typing events cannot be emitted for rooms not joined by that socket.

**Verification:**

```bash
cd /Users/willz/ai/Prompt/backend
npm run build
```

**Commit:**

```bash
git add backend/src/utils/socket.ts backend/src/utils/__tests__
git commit -m "fix: authorize support ticket socket rooms"
```

---

## Phase 2: Stop Cost-Abuse Paths

### Task 2.1: Harden guest prompt quota

**Severity:** High

**Objective:** Stop trivial guest quota bypass by rotating `X-Device-ID`.

**Files:**
- Modify: `backend/src/routes/prompts.ts:203-243`
- Modify: `backend/src/services/guestQuotaService.ts`
- Add: `backend/src/services/anonymousSessionService.ts` if needed
- Test: guest quota tests

**Implementation approach:**
1. Create server-issued anonymous session token signed with `JWT_ACCESS_SECRET` or dedicated `GUEST_SESSION_SECRET`.
2. Accept `X-Guest-Session` instead of trusting raw `X-Device-ID`; continue accepting old `X-Device-ID` temporarily only to mint a signed session, not to count quota alone.
3. Bind quota to signed session + IP bucket + user-agent hash.
4. Reserve quota before generation starts, not only after completion.
5. If generation fails before provider call, refund reservation. If provider call started, count usage.
6. Add route-specific IP limiter for `/guest/enhance/stream` stricter than global limiter.
7. Consider disabling guest `max` mode or image attachments until abuse controls are proven.

**Regression tests:**
- Tampered guest token is rejected.
- Same session cannot exceed limits.
- Rotating raw `X-Device-ID` without a valid signed session does not reset quota.
- Parallel requests cannot exceed quota.

**Verification:**

```bash
cd backend
npm run build
```

**Commit:**

```bash
git add backend/src/routes/prompts.ts backend/src/services/guestQuotaService.ts backend/src/services/anonymousSessionService.ts
git commit -m "fix: harden guest quota enforcement"
```

### Task 2.2: Gate developer signup/API key creation

**Severity:** High

**Objective:** Prevent mass minting of free API quota.

**Files:**
- Modify: `backend/src/routes/developerAuth.ts`
- Modify: `backend/src/services/developerAuthService.ts`
- Modify: `backend/src/routes/apiKeys.ts`
- Possibly add: email verification model/migration if not present

**Implementation approach:**
1. Add strict signup rate limits per IP and email/domain.
2. Require email verification before API key creation and public API use.
3. Add CAPTCHA/Turnstile on web signup if available.
4. Mark new developers `emailVerified: null`; do not create usable API keys until verified.
5. Consider reducing initial free API quota until verified/payment method exists.

**Regression tests:**
- Unverified developer cannot create API key.
- Unverified developer API key, if somehow present, cannot call public API.
- Verified developer can create key.
- Rate limiter blocks repeated signup attempts.

**Commit:**

```bash
git add backend/src/routes/developerAuth.ts backend/src/services/developerAuthService.ts backend/src/routes/apiKeys.ts backend/prisma
git commit -m "fix: gate developer API access behind verification"
```

---

## Phase 3: Fix Stripe and Web Auth Security

### Task 3.1: Whitelist Stripe checkout prices and redirect URLs

**Severity:** High

**Objective:** Prevent arbitrary Stripe price usage and open redirects.

**Files:**
- Modify: `web/app/api/stripe/checkout/route.ts:13-101`
- Modify if needed: `web/lib/api/subscriptions.ts`

**Implementation approach:**
1. Replace client-provided `priceId` trust with server-side allowlist from env.
2. Prefer client sends `{ tier, interval }`, server maps to price ID.
3. Derive `success_url` and `cancel_url` from `NEXT_PUBLIC_APP_URL` or trusted env, not request body.
4. Validate auth consistently: either pass Authorization from frontend or use HttpOnly cookie server-side.

**Regression tests:**
- Unknown price is rejected.
- External successUrl/cancelUrl are ignored or rejected.
- Valid tier/interval creates checkout session.

**Commit:**

```bash
git add web/app/api/stripe/checkout/route.ts web/lib/api/subscriptions.ts
git commit -m "fix: restrict Stripe checkout inputs"
```

### Task 3.2: Make Stripe webhook retry on backend failure

**Severity:** High

**Objective:** Prevent silent subscription event loss.

**Files:**
- Modify: `web/app/api/stripe/webhook/route.ts:95,200-217`
- Confirm backend route: `backend/src/routes/webhooks.ts` for idempotency

**Implementation approach:**
1. Change `notifyBackend()` to throw on non-2xx and network errors.
2. Include Stripe `event.id` and `event.type` in backend notification.
3. Backend should store/process idempotently by event ID.
4. Web route should return 500 to Stripe on backend forwarding failure.

**Regression tests:**
- Backend 500 causes webhook route 500.
- Duplicate event ID is idempotent.
- Valid event with successful backend returns 200.

**Commit:**

```bash
git add web/app/api/stripe/webhook/route.ts backend/src/routes/webhooks.ts
git commit -m "fix: retry Stripe webhooks on backend failure"
```

### Task 3.3: Remove tokens from URLs/readable storage

**Severity:** High

**Objective:** Reduce token theft risk from XSS/history/extensions/logging.

**Files:**
- Modify: `web/app/api/auth/google/callback/route.ts`
- Modify: `web/app/api/auth/apple/callback/route.ts`
- Modify: `web/app/api/auth/refresh/route.ts`
- Modify: `web/app/(dashboard)/layout.tsx`
- Modify: `web/lib/api/client.ts`
- Modify: `web/lib/stores/developerAuthStore.ts`

**Implementation approach:**
1. OAuth callbacks set HttpOnly Secure SameSite refresh/session cookie only.
2. Do not place accessToken/refreshToken in URL params.
3. Refresh route returns access token only if absolutely needed; never return refresh token JSON.
4. Prefer in-memory access token storage. If keeping current architecture temporarily, use short-lived access token and remove it from sessionStorage/localStorage.
5. Developer portal must not persist access/refresh tokens in localStorage. Use HttpOnly refresh cookie + in-memory access token.

**Regression tests:**
- Callback redirect URL contains no token params.
- `Set-Cookie` has HttpOnly, Secure, SameSite.
- Refresh response does not contain refreshToken.
- Developer auth store does not persist tokens to localStorage.

**Commit:**

```bash
git add web/app/api/auth web/app/'(dashboard)'/layout.tsx web/lib/api/client.ts web/lib/stores/developerAuthStore.ts
git commit -m "fix: remove web tokens from URL and persistent JS storage"
```

### Task 3.4: Implement OAuth state and PKCE verification

**Severity:** High

**Objective:** Prevent OAuth CSRF/login injection.

**Files:**
- Modify: `web/app/(auth)/login/page.tsx`
- Modify: `web/app/api/auth/google/callback/route.ts`
- Modify: `web/app/api/auth/apple/callback/route.ts`
- Possibly add: `web/app/api/auth/oauth/start/route.ts`

**Implementation approach:**
1. Move OAuth start to a server route that generates state/PKCE.
2. Store state/PKCE verifier in HttpOnly SameSite cookie.
3. Callback verifies state before accepting code/token.
4. Reject missing/mismatched state.

**Regression tests:**
- Missing state rejected.
- Mismatched state rejected.
- Matching state proceeds.

**Commit:**

```bash
git add web/app/api/auth web/app/'(auth)'/login/page.tsx
git commit -m "fix: verify OAuth state and PKCE"
```

### Task 3.5: Disable PWA caching for API/protected routes

**Severity:** High

**Objective:** Prevent protected data from persisting in Cache Storage.

**Files:**
- Modify: `web/next.config.js:117-140`

**Implementation approach:**
1. Remove `/api/*` runtime caching or set handler `NetworkOnly`.
2. Exclude `/dashboard`, `/admin`, `/developers`, `/settings`, `/profile`, `/history`, and auth callbacks from catch-all caching.
3. Only cache static assets, fonts, images, and public marketing pages if needed.
4. Add `Cache-Control: no-store` on auth/API/protected responses where practical.

**Regression tests/manual checks:**
- Build PWA.
- Login, hit dashboard/API, inspect Cache Storage: no API/private JSON stored.
- Logout and go offline: protected pages are not served with private data.

**Commit:**

```bash
git add web/next.config.js
git commit -m "fix: stop PWA caching private API responses"
```

---

## Phase 4: Fix Backend Rate/Quota Correctness

### Task 4.1: Make API rate limit fail closed or memory-fallback on Redis errors

**Severity:** Medium/High

**Files:**
- Modify: `backend/src/middleware/apiRateLimit.ts:110-120`

**Implementation approach:**
1. Replace `allowed: true` catch behavior.
2. Either call `checkRateLimitMemory()` in catch or return 503/429 for public API.
3. Add alert-level logging.

**Regression tests:**
- Simulated Redis failure still rate-limits via memory fallback or blocks request.

**Commit:**

```bash
git add backend/src/middleware/apiRateLimit.ts
git commit -m "fix: avoid fail-open API rate limiting"
```

### Task 4.2: Atomically reserve API quota before generation

**Severity:** Medium/High

**Files:**
- Modify: `backend/src/middleware/apiQuotaEnforcement.ts`
- Modify: `backend/src/services/apiUsageService.ts`
- Modify: `backend/src/services/apiSubscriptionService.ts`
- Modify public API route if quota increment currently happens after generation

**Implementation approach:**
1. Add `reserveApiQuota(developerId, estimatedCostOrOneRequest)`.
2. Use DB transaction or Redis atomic Lua/incr to reserve before expensive provider call.
3. Commit usage after success; if provider was never called, refund reservation.
4. Remove fail-open quota check behavior except explicit env flag for emergency.
5. Update cached usage synchronously.

**Regression tests:**
- Parallel calls cannot exceed monthly quota.
- Quota check DB error blocks request.
- Failed validation before provider call does not consume quota.
- Provider-started failure consumes or records billable usage per product decision.

**Commit:**

```bash
git add backend/src/middleware/apiQuotaEnforcement.ts backend/src/services/apiUsageService.ts backend/src/services/apiSubscriptionService.ts
git commit -m "fix: atomically reserve public API quota"
```

---

## Phase 5: Fix iOS App-Breaking Bugs and Privacy Issues

### Task 5.1: Make StoreKit backend verification durable

**Severity:** High

**Files:**
- Modify: `Prompt/Services/StoreKitManager.swift:80-99,335-347`
- Possibly add: pending transaction persistence in Keychain/UserDefaults

**Implementation approach:**
1. Change `syncTransactionWithBackend` to return success/failure or throw.
2. Persist `verification.jwsRepresentation` before backend call.
3. If backend verification fails, do not pretend server subscription is active.
4. Finish StoreKit transaction only after local verification; but keep pending backend sync queue and retry until backend confirms.
5. Show user “purchase pending activation” with retry.
6. On app launch, retry pending transaction JWS sync.

**Regression/manual tests:**
- Simulate backend 500 during purchase: app records pending activation and retries.
- Simulate backend success: subscription state updates.
- Restore purchases sends all current entitlements.

**Commit:**

```bash
git add Prompt/Services/StoreKitManager.swift
git commit -m "fix: make purchase backend verification durable"
```

### Task 5.2: Do not clear tokens on transient refresh failures

**Severity:** High

**Files:**
- Modify: `Prompt/Services/APIClient.swift:436-440`

**Implementation approach:**
1. If refresh response is 400/401/403, clear tokens.
2. If response is 429/5xx, preserve tokens and throw transient server/rate-limit error.
3. Add retry/backoff where appropriate.

**Regression tests/manual checks:**
- Mock 500 refresh: tokens remain.
- Mock 401 refresh: tokens clear.

**Commit:**

```bash
git add Prompt/Services/APIClient.swift
git commit -m "fix: preserve iOS tokens on transient refresh errors"
```

### Task 5.3: Fix iOS auth-state mismatch

**Severity:** Medium/High

**Files:**
- Modify: `Prompt/Services/AuthManager.swift`

**Implementation approach:**
1. Split `hasSignedIn` from `hasValidSession`.
2. On app launch, cached user can populate offline display, but authenticated features require token presence or successful `/auth/me`.
3. When tokens are cleared, show signed-out or offline-limited state.

**Regression/manual checks:**
- Clear keychain tokens but keep cached user: protected API features require sign-in.
- Valid tokens: user stays authenticated.

**Commit:**

```bash
git add Prompt/Services/AuthManager.swift
git commit -m "fix: separate cached profile from valid session"
```

### Task 5.4: Enforce final image payload size

**Severity:** Medium

**Files:**
- Modify: `Prompt/Services/ImageAttachmentProcessor.swift`

**Implementation approach:**
1. After final fallback compression, verify JPEG data size.
2. Verify base64 data URL/JSON payload size if API has 10MB body limit.
3. Downsample further or reject with user-facing error.

**Regression/manual checks:**
- Huge image is downsampled below limit or rejected gracefully.
- No 413 from backend for normal images.

**Commit:**

```bash
git add Prompt/Services/ImageAttachmentProcessor.swift
git commit -m "fix: enforce image attachment payload limit"
```

### Task 5.5: Reduce widget/App Group sensitive data exposure

**Severity:** Medium

**Files:**
- Modify: `Prompt/Shared/SharedDataManager.swift`
- Modify: `PromptWidgetExtension/QuickEnhanceWidget.swift`

**Implementation approach:**
1. Stop storing full prompt/enhanced prompt text in App Group by default.
2. Store short redacted preview only, or require opt-in.
3. Do not display email in widget.
4. Mark sensitive widget text `.privacySensitive()` where appropriate.
5. Clear App Group data on sign-out.

**Commit:**

```bash
git add Prompt/Shared/SharedDataManager.swift PromptWidgetExtension/QuickEnhanceWidget.swift
git commit -m "fix: reduce widget sensitive data exposure"
```

---

## Phase 6: Dependency Remediation

### Task 6.1: Patch backend production dependencies

**Severity:** Critical/High

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

**Targets:**
- `handlebars` critical/high advisories
- `jsrsasign` via Apple auth stack if fixable
- `socket.io`/`socket.io-parser`
- `express`, `body-parser`, `qs`, `path-to-regexp`, `ws`, `yaml`, `resend`, `uuid`

**Implementation approach:**
1. Run `npm audit fix --omit=dev` first.
2. If major upgrades are required, upgrade one package family at a time.
3. Build after each package family.
4. Run smoke tests for auth, webhooks, Socket.IO, email.

**Commands:**

```bash
cd backend
npm audit fix --omit=dev
npm run build
npm audit --omit=dev
```

**Commit:**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: patch backend vulnerable dependencies"
```

### Task 6.2: Patch web production dependencies

**Severity:** Critical/High

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Possibly modify: `web/next.config.js` if Next major upgrade needs changes

**Targets:**
- `next` patched release
- `jspdf >= 4.2.1` or remove if unused
- `next-pwa` replacement/removal or patched Workbox chain
- `socket.io-client` chain if present

**Implementation approach:**
1. Upgrade Next to the lowest patched compatible release first if possible.
2. Upgrade/remove jsPDF.
3. Consider disabling/removing `next-pwa` if it blocks audit remediation.
4. Run build and route smoke tests.

**Commands:**

```bash
cd web
npm install next@latest
npm install jspdf@latest
npm run build
npm audit --omit=dev
```

Adjust versions deliberately rather than blindly if latest creates breaking changes.

**Commit:**

```bash
git add web/package.json web/package-lock.json web/next.config.js
git commit -m "chore: patch web vulnerable dependencies"
```

---

## Phase 7: Final Verification and Release

### Task 7.1: Full local verification

**Commands:**

```bash
cd /Users/willz/ai/Prompt/backend
npm run build
npx prisma migrate status
npm audit --omit=dev

cd ../web
npm run build
npm audit --omit=dev

cd ..
xcodebuild -scheme Prompt -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' build
```

**Expected:** Builds pass. Audit has no critical/high production vulnerabilities or documented accepted exceptions.

### Task 7.2: Security smoke tests in staging

**Backend smoke tests:**
- Unsigned Resend webhook rejected.
- Valid signed Resend webhook accepted.
- Socket cannot join another user’s ticket.
- Guest quota cannot be bypassed by raw device ID rotation.
- Developer cannot create/use API key before verification.
- Redis outage does not fail open for public API rate limit.

**Web smoke tests:**
- Stripe checkout rejects unknown price.
- Stripe checkout ignores external redirects.
- Stripe webhook returns 500 when backend forwarding fails.
- OAuth callback URL contains no tokens.
- Refresh endpoint does not return refresh token.
- Cache Storage contains no `/api/*` authenticated responses.

**iOS smoke tests:**
- Backend 500 during purchase creates pending activation state.
- Refresh 500 does not log user out.
- Refresh 401 logs user out.
- Large image is rejected/downsampled safely.
- Widget does not show email/full sensitive prompt text.

### Task 7.3: Independent review

Use `requesting-code-review` skill.

Required checks:

```bash
git diff main...HEAD
```

Ask independent reviewer to focus on:
- auth bypass
- webhook verification correctness
- token leakage
- quota/rate-limit race conditions
- PWA cache regressions
- dependency major-version breakages

### Task 7.4: Deploy order

1. Deploy backend security fixes.
2. Confirm migrations/status and backend smoke tests.
3. Deploy web fixes.
4. Validate auth/Stripe/PWA behavior in production.
5. Ship iOS update through TestFlight, then App Store.

---

## Definition of Done

- Resend webhook cannot be forged.
- Socket.IO ticket rooms enforce user/admin authorization.
- Guest and developer cost-abuse paths have server-side controls.
- Stripe checkout inputs are server-whitelisted.
- Stripe webhooks retry on backend failure.
- Web tokens are not placed in URLs/localStorage/readable refresh responses.
- OAuth state/PKCE is verified.
- PWA does not cache private API/protected responses.
- iOS purchase backend verification is durable.
- iOS refresh does not clear tokens on transient errors.
- Critical/high production dependency advisories are fixed or explicitly risk-accepted.
- Backend, web, and iOS builds pass.
- Security smoke tests pass in staging/production.
