# CLAUDE.md

## Project Overview

Promptomize — full-stack AI prompt enhancement app.

| Directory | Stack | Purpose |
|-----------|-------|---------|
| `backend/` | Express, TypeScript, Prisma, PostgreSQL | REST API |
| `web/` | Next.js 14, React, TailwindCSS, Zustand | Marketing + dashboard + dev portal |
| `Prompt/` | SwiftUI, StoreKit 2 (iOS 18.0+) | iOS app |
| `PromptWidgetExtension/` | WidgetKit (iOS 17.0+) | iOS widget (shared code via `Prompt/Shared/`) |
| `PromptKeyboard/` | UIKit | Custom keyboard extension |
| `fastlane/` | Ruby | App Store submission automation |

## Commands

### Backend (`backend/`)
```bash
npm run dev          # tsx watch, port 3000
npm run build && npm start  # production
npm run db:generate  # regenerate Prisma client
npm run db:push      # push schema (dev ONLY)
npm run db:migrate   # prisma migrate deploy (production)
npm run db:studio    # Prisma Studio GUI
npx prisma migrate dev --name <desc>  # create migration (dev)
```

### Web (`web/`)
```bash
npm run dev    # Next.js dev, port 3000
npm run build  # production build
npm run lint   # ESLint
```

### iOS (project root)
```bash
xcodebuild -scheme Prompt -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' build
open Prompt.xcodeproj
```

### Prerequisites
Local PostgreSQL required. Redis optional in dev (required for queues/caching at scale).

## Architecture

### Enhancement Pipeline (core feature)
`promptEnhancementEngine.ts` orchestrates multi-provider AI enhancement:
- **DeepSeek** (primary), Anthropic, OpenAI, Google Gemini as providers
- **Meta-prompt system** (`services/metaPrompts/modalities/`) — 6 modality-specific builders (text, image, video, audio, code, 3d) with per-platform optimizations (Midjourney, DALL-E, Stable Diffusion, etc.)

### Data Flow: Prompt Enhancement
iOS `PromptViewModel.enhance()` → `APIClient` → backend `/api/v1/prompts/enhance` → `quotaEnforcement` middleware → `promptEnhancementEngine` → AI provider → response stored in `Prompt` table → iOS updates UI + saves to history

### Auth Flow
1. iOS: Apple Sign-In → identity token + auth code → `/api/v1/auth/apple`
2. Backend verifies with Apple → JWT access (15min) + refresh token (7 days)
3. iOS stores tokens in shared Keychain (`SharedKeychainHelper`) for widget access
4. `APIClient` (actor-based) auto-refreshes expired tokens

### Two Separate Subscription Systems (critical distinction)
**App subscriptions** — iOS StoreKit 2 + web Stripe → `Subscription` model, enforced via `quotaEnforcement.ts` middleware + `DailyUsage` table. Tiers: FREE / PRO / PREMIUM.

**Enterprise API subscriptions** — Stripe only → `ApiSubscription` model + `Developer` accounts. Tiers: API_FREE / API_STARTER / API_PRO / API_ENTERPRISE. Completely separate routes, models, and billing.

### API Structure
All routes mount under `/api/v1/` in `backend/src/index.ts`. Read that file for the full route map. Key groupings:
- **Core:** auth, prompts, threads, subscriptions, webhooks, collections, templates, analytics, support, platforms, contexts, sandbox, workflows, variations
- **Enterprise:** developer/auth, api-keys, public (X-API-Key header), api-subscriptions, docs
- **Admin:** admin routes (X-Admin-API-Key header)

### Key Services
- `guestQuotaService.ts` — guest trial quota with sign-in gating
- `maxModeQuotaService.ts` — premium unlimited mode
- `imageAnalysisService.ts` — image attachment analysis
- `schemaCompatibilityService.ts` — legacy DB schema handling
- `variationsService.ts` — A/B testing with auto-resume on startup
- BullMQ for background jobs, Redis for caching/rate-limiting, Socket.IO for real-time support chat

## Code Patterns

### Backend (critical — follow exactly)
- **ESM modules** (`"type": "module"` in package.json)
- **TypeScript imports MUST use `.js` extensions** (NodeNext resolution): `import { foo } from './bar.js'`
- Target: ES2022, strict mode, `noUncheckedIndexedAccess: true`
- **Env vars via bracket notation**: `process.env['VAR_NAME']` (not dot notation)
- Zod for request validation at route boundaries
- Pino for structured logging (multiple logger instances: `logger`, `promptLogger`, `subscriptionLogger`, `webhookLogger`)
- See `backend/.env.example` for all env vars

### iOS
- MVVM with `@Observable` macro (iOS 17+)
- `@MainActor` for all UI-related classes
- `actor APIClient` for thread-safe networking
- Bundle ID: `com.res.promptomizer`
- URL scheme: `promptomize://`
- Shared Keychain access group for widget + keyboard extensions
- Firebase Analytics + Crashlytics, SwiftData for local persistence

### Web
- Next.js 14 App Router with route groups
- Path alias: `@/*` → project root
- PWA via `next-pwa`
- Zustand for client state, React Query for server state
- `jose` for JWT client-side, API client layer in `web/lib/api/` with auto token refresh
- See `web/.env.example` for all env vars

## Deployment

| Component | Platform | Config |
|-----------|----------|--------|
| Backend | Railway (Docker) | `backend/railway.json`, `backend/Dockerfile` |
| Web | Vercel (iad1) | `web/vercel.json` |
| iOS | App Store | `fastlane/`, `ExportOptions.plist` |

CI/CD via `.github/workflows/` — backend.yml, web.yml, ios.yml. All auto-deploy from main.

## Critical Rules
- **Never `db:push` in production.** Use `prisma migrate dev` in dev, `npm run db:migrate` in prod.
- **Prisma schema has 34 models.** `Subscription` (app users) and `ApiSubscription` (enterprise devs) are entirely separate systems — never conflate them.
- **Webhook idempotency** via `WebhookIdempotencyKey` table (SHA-256 key hashing, 24h TTL). Don't bypass it.
- **No test framework configured.** iOS CI has test step with `continue-on-error: true`.
- **All third-party AI names must be generic in App Store metadata** — no "ChatGPT", "Claude", etc. (China App Store rejection history).
