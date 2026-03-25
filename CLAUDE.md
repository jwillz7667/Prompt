# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Promptomize is a full-stack prompt enhancement app with four components:
- **backend/** - Node.js/Express REST API (TypeScript, Prisma, PostgreSQL)
- **web/** - Next.js marketing site + dashboard + developer portal (React, TailwindCSS, Zustand)
- **Prompt/** - iOS app (SwiftUI, StoreKit 2)
- **PromptWidgetExtension/** - iOS widget extension (shares code via Prompt/Shared/)

## Common Commands

### Backend (in `backend/`)
```bash
npm run dev                # tsx watch with hot-reload (port 3000)
npm run build && npm start # Production build (tsc → node dist/index.js)

# Database
npm run db:generate        # Generate Prisma client after schema changes
npm run db:push            # Push schema to database (dev only, NEVER production)
npm run db:migrate         # prisma migrate deploy (production)
npm run db:studio          # Open Prisma Studio GUI
npx prisma migrate dev --name description  # Create new migration (dev)

# Note: postinstall hook auto-runs prisma generate on npm install
```

### Web (in `web/`)
```bash
npm run dev                # Next.js dev server (port 3000)
npm run build              # Production build
npm run lint               # ESLint
```

### iOS (in project root)
```bash
xcodebuild -scheme Prompt -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' build
open Prompt.xcodeproj
```

### Local Dev Prerequisites
No docker-compose exists. You need local PostgreSQL and optionally Redis running:
- PostgreSQL for `DATABASE_URL`
- Redis for caching/queues/rate-limiting (optional in dev, required at scale)

## Architecture

### Multi-Provider AI Enhancement Pipeline
The core enhancement flow goes through `promptEnhancementEngine.ts`, which orchestrates:
- **DeepSeek** (`deepseekService.ts`) - Primary enhancement provider
- **Anthropic** (`@anthropic-ai/sdk`), **OpenAI** (`openai`), **Google Gemini** (`@google/generative-ai`) - Additional providers
- **Meta-prompt system** (`services/metaPrompts/`) - 7 modality-specific builders (text, image, video, audio, code, 3d) with platform-specific optimizations (Midjourney, DALL-E, Stable Diffusion, etc.)

### Key Data Flow: Prompt Enhancement
1. iOS `PromptViewModel.enhance()` → `APIClient.request("/prompts/enhance")`
2. Backend `promptRouter` → `quotaEnforcement` middleware → `promptEnhancementEngine`
3. Engine selects modality builder → calls AI provider → response stored in `Prompt` table
4. iOS updates UI, saves to history via `PromptHistoryManager`

### Backend Middleware Chain (order matters)
1. `helmet()` - Security headers
2. `cors()` - CORS with credential support
3. `rateLimit()` - Global rate limiting
4. `compression()` - gzip
5. `express.json({ limit: '10mb' })` - JSON parsing (raw body captured for Stripe webhooks)
6. `requestLogger()` - Structured logging with request ID (X-Request-ID) and timing
7. Route handlers (with per-route middleware: `authenticate`, `enforceQuota`, `apiKeyAuth`, `idempotency`)
8. `errorHandler` - Centralized error handling

### API Routes

All routes are mounted under `/api/v1/` in `backend/src/index.ts`:

**Core API (iOS/Web app):**
- `/auth` - Apple/Google OAuth, token refresh, logout
- `/prompts` - CRUD + enhance endpoint
- `/threads` - Conversation threads with multi-turn enhancement
- `/subscriptions` - IAP verification, Stripe for web
- `/webhooks` - App Store Server notifications (with idempotency)
- `/templates` - User and built-in templates
- `/collections` - Organize prompts into folders
- `/analytics` - Usage stats
- `/support` - Support ticket system with Socket.IO chat
- `/admin` - Admin endpoints (auth via `X-Admin-API-Key`)
- `/platforms` - Platform presets and user platform settings
- `/contexts` - Reusable project context for prompts
- `/sandbox` - Test prompts against multiple platforms
- `/workflows` - Multi-step prompt workflows
- `/variations` - A/B testing and prompt version management

**Developer/Enterprise API:**
- `/developer/auth` - Developer account registration/login
- `/api-keys` - API key management
- `/public` - Public API (auth via `X-API-Key` header): enhance, history, usage, quota
- `/api-subscriptions` - Enterprise API billing (separate tier system)
- `/webhooks/api-stripe` - Stripe webhooks for API subscriptions
- `/docs` - API documentation

### Authentication Flow
1. iOS: Apple Sign-In → identity token + auth code → backend `/auth/apple`
2. Backend verifies with Apple, creates/updates user → returns JWT (15min) + refresh token (7 days)
3. iOS stores tokens in shared Keychain (`SharedKeychainHelper`) for widget access
4. `APIClient` (actor-based) auto-refreshes expired tokens

### Two Separate Subscription Systems
**App subscriptions** (iOS StoreKit 2 + web Stripe → `Subscription` model):

| Tier | Daily Prompts | Max Tokens | Quality |
|------|--------------|------------|---------|
| FREE | 10 | 4k | basic |
| PRO | 100 | 8k | standard |
| PREMIUM | Unlimited | 16k | advanced |

Enforced via `quotaEnforcement.ts` middleware using `DailyUsage` table.

**Enterprise API subscriptions** (Stripe only → `ApiSubscription` model with `Developer` accounts):
API_FREE (100 req/mo) → API_STARTER (1k) → API_PRO (10k) → API_ENTERPRISE (unlimited)

These are completely separate systems with different models, routes, and billing.

### Background Processing & Real-Time
- **BullMQ** (`utils/queue.ts`) for background job processing (enhancement jobs, notifications)
- **Redis** (`utils/redis.ts`) for caching, rate limiting, pub/sub for Socket.IO scaling
- **Socket.IO** (`utils/socket.ts`) for real-time support chat (polling + websocket, 25s ping, 60s timeout)
- **Idempotency cleanup** scheduler runs hourly for webhook deduplication

### Web State Management
- React Query (`@tanstack/react-query`) for server state
- Zustand stores for client state: `authStore`, `subscriptionStore`, `settingsStore`, `developerAuthStore`, `uiStore`
- `jose` for JWT handling client-side
- API client layer in `web/lib/api/` with auto token refresh
- React Query hooks in `web/lib/hooks/` (useAuth, usePrompts, useEnhance, useSubscription, etc.)

## Code Patterns

### Backend
- ESM modules (`"type": "module"` in package.json)
- **TypeScript imports must use `.js` extensions** (NodeNext module resolution): `import { foo } from './bar.js'`
- Target: ES2022, strict mode with `noUncheckedIndexedAccess`
- Zod for request validation in routes
- Pino for structured JSON logging (pino-pretty in dev)
- Env vars accessed via bracket notation: `process.env['VAR_NAME']`
- Multiple logger instances: `logger`, `promptLogger`, `subscriptionLogger`, `webhookLogger`, `createRequestLogger(requestId)`

### iOS
- MVVM with `@Observable` macro (iOS 17+)
- `@MainActor` for all UI-related classes
- `actor APIClient` for thread-safe networking
- Shared Keychain access group for widget extension
- StoreKit 2 for subscriptions
- Bundle ID: `com.res.promptomizer`
- URL scheme: `promptomize://`
- Backend URL hardcoded in `APIClient.swift`
- Firebase Analytics + Crashlytics, SwiftData for local persistence

### Web
- Next.js 14 App Router with route groups
- Path alias: `@/*` maps to project root
- PWA via `next-pwa` with 11 runtime caching strategies
- Framer Motion for animations
- Security headers configured in both `next.config.js` and `vercel.json`

## Environment Variables

### Backend (see `backend/.env.example`)
Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_ISSUER_ID`, `APPLE_BUNDLE_ID`, `DEEPSEEK_API_KEY`

Optional: `DATABASE_DIRECT_URL` (for migrations, bypasses connection pooler), `REDIS_URL`, `RESEND_API_KEY`, `SENTRY_DSN`, `CORS_ORIGIN` (comma-separated), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_API_KEY`, `STRIPE_API_SECRET_KEY`, `LOG_LEVEL`

### Web (see `web/.env.example`)
`NEXT_PUBLIC_API_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRICE_*`, `BACKEND_WEBHOOK_SECRET`, `NEXT_PUBLIC_APPLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

## CI/CD & Deployment

### Backend
- **Railway** (Docker) - auto-deploys from main via `.github/workflows/backend.yml`
- Multi-stage Dockerfile: `node:20-slim`, OpenSSL for Prisma, non-root user `expressjs:1001`
- CI: npm ci → prisma generate → db push → tsc check → build (PostgreSQL 16 service in CI)
- Config: `backend/railway.json` (restart on failure, max 10 retries)

### Web
- **Vercel** - auto-deploys from main via `.github/workflows/web.yml`
- Region: `iad1` (N. Virginia)
- CI: lint → build → deploy via Vercel CLI
- Config: `web/vercel.json` (security headers, `/app` → App Store redirect)

### iOS
- CI via `.github/workflows/ios.yml` on `macos-14`, Xcode 15.2
- Build: iPhone 15 Pro simulator (iOS 17.2, debug)
- Archive: Generic iOS + `ExportOptions.plist`
- Release: App Store via Xcode Archive

## Testing
No test framework is currently configured (no Jest/Vitest/Playwright setup). iOS CI has test step with `continue-on-error: true`.

## Critical Notes
- Always use `prisma migrate dev` in development and `npm run db:migrate` in production. Never `db:push` in production.
- The Prisma schema has ~34 models. Key distinction: `Subscription` (app users) vs `ApiSubscription` (enterprise developers) are entirely separate systems.
- Webhook idempotency via `WebhookIdempotencyKey` table prevents duplicate App Store notification processing (SHA-256 key hashing, 24-hour TTL).
