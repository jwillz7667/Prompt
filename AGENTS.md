# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Promptomize is a full-stack prompt enhancement app with four components:
- **backend/** - Node.js/Express REST API (TypeScript, Prisma, PostgreSQL)
- **web/** - Next.js marketing site + dashboard + developer portal (React, TailwindCSS, Zustand)
- **Prompt/** - iOS app (SwiftUI, StoreKit 2)
- **PromptWidgetExtension/** - iOS widget extension (shares code via Prompt/Shared/)

## Common Commands

### Backend (in `backend/`)
```bash
npm run dev                # Development server with hot-reload (port 3000)
npm run build && npm start # Production build (tsc → node dist/index.js)

# Database
npm run db:generate        # Generate Prisma client after schema changes
npm run db:push            # Push schema to database (dev only)
npm run db:migrate         # Run migrations (production)
npm run db:studio          # Open Prisma Studio GUI
npx prisma migrate dev --name description  # Create new migration (dev)
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

## Architecture

### Multi-Provider AI Enhancement Pipeline
The core enhancement flow goes through `promptEnhancementEngine.ts`, which orchestrates:
- **DeepSeek** (`deepseekService.ts`) - Primary enhancement provider
- **Anthropic** (`@anthropic-ai/sdk`), **OpenAI** (`openai`), **Google Gemini** (`@google/generative-ai`) - Additional providers
- **Meta-prompt system** (`services/metaPrompts/`) - Modality-specific prompt builders (text, image, video, audio, code, 3d) with platform-specific optimizations (Midjourney, DALL-E, Stable Diffusion, etc.)

### Key Data Flow: Prompt Enhancement
1. iOS `PromptViewModel.enhance()` → `APIClient.request("/prompts/enhance")`
2. Backend `promptRouter` → `quotaEnforcement` middleware → `promptEnhancementEngine`
3. Engine selects modality builder → calls AI provider → response stored in `Prompt` table
4. iOS updates UI, saves to history via `PromptHistoryManager`

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

### Subscription Tiers (App)
| Tier | Daily Prompts | Max Tokens | Quality |
|------|--------------|------------|---------|
| FREE | 10 | 4k | basic |
| PRO | 100 | 8k | standard |
| PREMIUM | Unlimited | 16k | advanced |

Enforced via `quotaEnforcement.ts` middleware using `DailyUsage` table.

### Enterprise API Tiers (separate from app)
API_FREE (100 req/mo) → API_STARTER (1k) → API_PRO (10k) → API_ENTERPRISE (unlimited). Managed via `ApiSubscription` model with Stripe billing.

### Background Processing
- **BullMQ** (`utils/queue.ts`) for background job processing (enhancement jobs, notifications)
- **Redis** (`utils/redis.ts`) for caching, rate limiting, pub/sub for Socket.IO scaling
- **Idempotency cleanup** scheduler runs hourly for webhook deduplication

### Web Structure
```
web/app/
├── (marketing)/      # Public pages (landing, pricing)
├── (dashboard)/      # Authenticated user pages
├── (auth)/           # Login flow
├── admin/            # Admin panel
├── developers/
│   ├── (auth)/       # Developer login/register
│   └── (portal)/     # API key management, usage dashboard
├── docs/             # API documentation
└── offline/          # PWA offline page
```
State management: React Query (server state) + Zustand (client state) + `jose` (JWT client-side)

## Code Patterns

### Backend
- ESM modules (`"type": "module"` in package.json)
- **TypeScript imports must use `.js` extensions** (NodeNext module resolution): `import { foo } from './bar.js'`
- TypeScript strict mode with `noUncheckedIndexedAccess`
- Zod for request validation in routes
- Pino for structured JSON logging
- Env vars accessed via bracket notation: `process.env['VAR_NAME']`

### iOS
- MVVM with `@Observable` macro (iOS 17+)
- `@MainActor` for all UI-related classes
- `actor APIClient` for thread-safe networking
- Shared Keychain access group for widget extension
- StoreKit 2 for subscriptions
- Bundle ID: `com.res.promptomizer`
- Backend URL hardcoded in `APIClient.swift`

### Web
- Next.js 14 App Router with route groups
- React Query for server state, Zustand for client state
- PWA support via `next-pwa`
- Framer Motion for animations

## Environment Variables

### Backend (see `backend/.env.example`)
Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_ISSUER_ID`, `APPLE_BUNDLE_ID`, `DEEPSEEK_API_KEY`

Optional: `REDIS_URL`, `RESEND_API_KEY`, `SENTRY_DSN`, `CORS_ORIGIN` (comma-separated)

### Web (see `web/.env.example`)
`NEXT_PUBLIC_API_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRICE_*`, `BACKEND_WEBHOOK_SECRET`

## Deployment
- **Backend**: Railway (Docker) - auto-deploys from main
- **Web**: Vercel - auto-deploys from main
- **iOS**: App Store via Xcode Archive + `ExportOptions.plist`

## Critical Notes
- Always use `prisma migrate dev` in development and `npm run db:migrate` in production. Never `db:push` in production.
- Two separate subscription systems: app subscriptions (iOS StoreKit 2 + web Stripe → `Subscription` model) and enterprise API subscriptions (Stripe only → `ApiSubscription` model with `Developer` accounts)
- Socket.IO initialized in `backend/src/utils/socket.ts` for real-time support chat
- Webhook idempotency via `WebhookIdempotencyKey` table prevents duplicate App Store notification processing
