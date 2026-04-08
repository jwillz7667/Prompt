# Promptomize — CLAUDE.md

Full-stack AI prompt enhancement platform: iOS (SwiftUI) + Express API + Next.js web + WidgetKit/Keyboard extensions. Users enter raw prompts, the backend enhances them via multi-provider AI (DeepSeek primary, Anthropic/OpenAI/Gemini fallback), and returns optimized output tailored to modality (text/image/video/audio/code/3d) and target platform (Midjourney, DALL-E, etc.).

## Mental Model — Visualize Before You Code

Before touching any file, build a mental picture of the full system:

**The core loop**: User types prompt (iOS/web) → `APIClient`/`apiClient` sends to Express backend → `quotaEnforcement` middleware gates by tier → `promptEnhancementEngine.ts` selects AI provider + modality-specific meta-prompt → streams SSE response back → client renders incrementally → result persists to Postgres (`Prompt` table) + local SwiftData.

**Auth spine**: Apple/Google Sign-In → backend verifies → JWT pair (15min access / 7d refresh) → iOS stores in shared Keychain (App Group `group.com.res.promptomizer`) so widget + keyboard extensions share auth state → `APIClient` actor auto-refreshes on 401. Web stores access in sessionStorage, refresh in HTTP-only cookie.

**Two subscription systems (never conflate)**: App tiers (FREE/PRO/PREMIUM) via StoreKit 2 + Stripe → `Subscription` model, enforced by `quotaEnforcement.ts` + `DailyUsage`. Enterprise API tiers (API_FREE/STARTER/PRO/ENTERPRISE) via Stripe only → `ApiSubscription` model + `Developer` accounts, enforced by `apiQuotaEnforcement.ts`. Separate routes, separate models, separate billing.

**Real-time layer**: BullMQ queues async work (variations, email, webhooks). Socket.IO for live support chat + notifications. iOS Live Activities for in-progress enhancements.

Trace any feature through all layers before implementing. Identify which middleware, service, model, and client-side state are involved. If a change touches the enhancement pipeline, trace from `PromptViewModel.enhance()` (iOS) or `useEnhance` hook (web) through the backend and back.

## Engineering Standards

Approach every task as a senior engineer with deep full-stack expertise would:

- **Diagnose before coding.** Read the relevant source files. Trace the execution path. Understand the existing patterns. Never guess at architecture — verify it.
- **Production-grade output only.** Zero stubs, zero pseudocode, zero placeholder comments. Every line of code must be deployable. If a function is worth writing, write it completely.
- **Respect existing patterns.** This codebase has established conventions per layer (below). Match them exactly. Don't introduce new patterns without justification.
- **Think in layers.** iOS (presentation + local state) → API transport → Express middleware chain → service layer → Prisma/Postgres. Each layer has its own concerns and conventions. Never leak abstractions across layers.
- **Debug systematically.** Read the error. Check the middleware chain. Verify the request/response shape. Check Prisma query output. Don't shotgun-fix — isolate the layer, reproduce, then fix.
- **Edge cases matter.** Consider: expired tokens, quota exhaustion, network failures mid-stream, race conditions in concurrent APIClient calls, StoreKit transaction states, webhook replay/idempotency.

## Commands

### Backend (`backend/`)
```bash
npm run dev                          # tsx watch, port 3000
npm run build && npm start           # production
npm run db:generate                  # regenerate Prisma client after schema change
npm run db:push                      # push schema — DEV ONLY, NEVER PRODUCTION
npm run db:migrate                   # prisma migrate deploy (production)
npx prisma migrate dev --name <desc> # create migration (dev)
npm run db:studio                    # Prisma Studio GUI
```

### Web (`web/`)
```bash
npm run dev    # Next.js dev, port 3000
npm run build  # production build
npm run lint   # ESLint
```

### iOS (project root)
```bash
xcodebuild -scheme Prompt -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build
```

**Prerequisites**: Local PostgreSQL required. Redis optional in dev (required for BullMQ queues and rate limiting at scale).

## Backend Conventions (Express + TypeScript + Prisma)

**These are non-negotiable — violating them causes build/runtime failures:**

- **ESM modules** — `"type": "module"` in package.json. All imports MUST use `.js` extensions: `import { foo } from './bar.js'` (NodeNext module resolution). Omitting `.js` = runtime crash.
- **Env vars via bracket notation** — `process.env['VAR_NAME']`, not `process.env.VAR_NAME`. Required by `noUncheckedIndexedAccess: true` in tsconfig.
- **TypeScript target**: ES2022, strict mode. No `any`, no unsafe casts.
- **Zod** for request validation at route boundaries. Define schemas in the route file, not in services.
- **Pino** for structured logging — use existing logger instances (`logger`, `promptLogger`, `subscriptionLogger`, `webhookLogger`). Never `console.log`.
- **Route structure**: All routes mount under `/api/v1/` in `backend/src/index.ts`. Read that file to see the full route map before adding/modifying routes.
- **Middleware chain**: `auth.ts` (JWT validation) → `quotaEnforcement.ts` (tier gating) → route handler → `errorHandler.ts`. Enterprise routes use `apiKeyAuth.ts` → `apiQuotaEnforcement.ts` instead.
- **Service layer**: Business logic lives in `services/`. Routes are thin — validate input, call service, return response. Never put business logic in route handlers.
- **Prisma**: 40+ models in schema. `Subscription` (app users) and `ApiSubscription` (enterprise devs) are entirely separate — different tables, different routes, different middleware. Never conflate them.
- **Webhook idempotency**: `WebhookIdempotencyKey` table with SHA-256 key hashing, 24h TTL. Always check idempotency on webhook handlers.
- **Enhancement engine**: `promptEnhancementEngine.ts` orchestrates provider selection + streaming. Meta-prompts in `services/metaPrompts/modalities/` (text, image, video, audio, code, 3d) with platform-specific optimizations in `services/metaPrompts/platforms/`.

## iOS Conventions (SwiftUI + Swift 6)

- **MVVM** with `@Observable` macro. ViewModels are `@MainActor` classes. Views are structs.
- **`actor APIClient`** — thread-safe networking with automatic JWT refresh. Base URL: `https://backend-production-d538.up.railway.app/api/v1`. All network calls go through this actor.
- **Shared state across extensions**: App Group `group.com.res.promptomizer`. `SharedKeychainHelper` for auth tokens, `SharedDataManager` for user defaults. Widget and keyboard extensions access these — any auth change must update shared state.
- **SwiftData** for local persistence (`LocalPromptRecord`, etc.). `SyncManager` handles cloud sync.
- **StoreKit 2** for subscriptions. `StoreKitManager` handles purchases, verification via backend `/api/v1/subscriptions/verify-purchase`, and entitlement caching.
- **Bundle ID**: `com.res.promptomizer`. URL scheme: `promptomize://`.
- **Firebase** Analytics + Crashlytics. Never log PII.
- **Value types** (`struct`, `enum`) over classes unless reference semantics needed. `guard` for early returns. Booleans as questions (`isLoading`, `hasCompleted`).
- **Error types** as enums conforming to `LocalizedError`.
- **Concurrency**: `async/await`, structured concurrency. No completion handlers in new code.

## Web Conventions (Next.js 14 + React)

- **App Router** with route groups: `(marketing)`, `(auth)`, `(dashboard)`, `admin`, `developers`, `docs`.
- **Path alias**: `@/*` maps to project root.
- **State**: Zustand stores (`lib/stores/`) for client state. TanStack React Query (`lib/hooks/`) for server state. Never mix concerns.
- **API client**: `lib/api/client.ts` — auto token refresh, SSE streaming support. All backend calls go through this layer.
- **Auth**: `jose` for JWT client-side. OAuth callbacks in `app/api/auth/`. Protected routes via `middleware.ts`.
- **Payments**: Stripe checkout via `app/api/stripe/`. Webhooks hit backend, not Next.js directly (except Stripe webhook).
- **PWA** via `next-pwa`. Offline page at `/offline/`.
- **Strict TypeScript** — no `any`, no `as` casts. Types in `lib/types/`.

## Deployment

| Component | Platform | Config | Auto-deploy |
|-----------|----------|--------|-------------|
| Backend | Railway (Docker) | `backend/railway.json`, `backend/Dockerfile` | `main` push via `.github/workflows/backend.yml` |
| Web | Vercel (iad1) | `web/vercel.json` | `main` push via `.github/workflows/web.yml` |
| iOS | App Store | `fastlane/`, `ExportOptions.plist` | `.github/workflows/ios.yml` → TestFlight |

**Production URLs**: Backend `https://backend-production-d538.up.railway.app`, Web `https://promptomize.app`.

## Critical Rules

1. **Never `db:push` in production.** `prisma migrate dev` locally, `npm run db:migrate` in prod. Violating this can drop data.
2. **Never conflate Subscription and ApiSubscription.** Different models, different routes, different middleware, different billing. Read the schema before touching either.
3. **Never bypass webhook idempotency.** Stripe/Apple can replay webhooks. The `WebhookIdempotencyKey` table prevents duplicate processing.
4. **No third-party AI brand names in App Store metadata.** No "ChatGPT", "Claude", "GPT-4", etc. Use generic terms ("AI models", "language models"). China App Store has rejected for this.
5. **No test framework configured.** iOS CI has test step with `continue-on-error: true`. Be extra careful with manual verification.
6. **Backend `.env.example` has 40+ vars.** Read it before adding new env vars — naming follows established patterns.
7. **iOS extensions share auth via App Group.** Any change to auth token storage/format must be coordinated across main app, widget, and keyboard extension.
