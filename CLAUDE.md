# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Promptomize is a full-stack prompt enhancement app with three components:
- **backend/** - Node.js/Express REST API (TypeScript, Prisma, PostgreSQL)
- **web/** - Next.js marketing site + dashboard (React, TailwindCSS, Zustand)
- **Prompt/** - iOS app (SwiftUI, StoreKit 2)
- **PromptWidgetExtension/** - iOS widget extension (shares code via Prompt/Shared/)

## Common Commands

### Backend (in `backend/`)
```bash
npm run dev                # Development server with hot-reload (port 3000)
npm run build && npm start # Production build

# Database
npm run db:generate        # Generate Prisma client after schema changes
npm run db:push            # Push schema to database (dev)
npm run db:migrate         # Run migrations (production)
npm run db:studio          # Open Prisma Studio GUI
```

### Web (in `web/`)
```bash
npm run dev                # Next.js dev server (port 3001)
npm run build              # Production build
npm run lint               # ESLint
```

### iOS (in project root)
```bash
# Build for simulator
xcodebuild -scheme Prompt -destination 'platform=iOS Simulator,name=iPhone 16 Pro Max' build

# Open in Xcode
open Prompt.xcodeproj
```

## Architecture

### Backend Structure
```
backend/src/
├── index.ts              # Express app setup, routes mounting
├── routes/               # API endpoints (auth, prompts, subscriptions, webhooks, etc.)
├── services/             # Business logic (authService, appleStoreService, subscriptionService)
├── middleware/           # auth, errorHandler, quotaEnforcement, idempotency
└── utils/                # prisma client, jwt, logger (pino)
```

### iOS Structure
```
Prompt/
├── Services/             # Core services (APIClient, AuthManager, StoreKitManager, DeepseekService)
├── ViewModels/           # MVVM view models (PromptViewModel, TemplateViewModel)
├── Views/                # SwiftUI views
├── Components/           # Reusable UI components
├── Theme/                # AppColors (AAA accessibility), LiquidGlassStyles
├── Shared/               # Code shared with widget extension (SharedKeychainHelper, SharedDataManager)
└── Intents/              # App Intents, shortcuts
```

### Web Structure
```
web/
├── app/                  # Next.js App Router pages
│   ├── (marketing)/      # Public pages (landing, pricing)
│   ├── (dashboard)/      # Authenticated pages
│   └── (auth)/           # Login flow
├── lib/
│   ├── api/              # API client functions per resource
│   ├── hooks/            # React Query hooks (useAuth, usePrompts, useSubscription)
│   └── stores/           # Zustand stores (authStore, subscriptionStore)
└── components/           # UI components
```

### API Routes
```
/api/v1/auth          - Apple/Google OAuth, token refresh, logout
/api/v1/prompts       - CRUD + enhance endpoint (uses DeepSeek)
/api/v1/subscriptions - IAP verification, Stripe for web
/api/v1/webhooks      - App Store Server notifications (with idempotency)
/api/v1/templates     - User and built-in templates
/api/v1/collections   - Organize prompts into folders
/api/v1/analytics     - Usage stats
```

### Authentication Flow
1. iOS: Apple Sign-In → identity token + auth code → backend `/auth/apple`
2. Backend verifies with Apple, creates/updates user → returns JWT (15min) + refresh token (7 days)
3. iOS stores tokens in shared Keychain (`SharedKeychainHelper`) for widget access
4. `APIClient` (actor-based) auto-refreshes expired tokens

### Subscription Tiers
| Tier | Daily Prompts | Max Tokens | Quality |
|------|--------------|------------|---------|
| FREE | 10 | 4k | basic |
| PRO | 100 | 8k | standard |
| PREMIUM | Unlimited | 64k | advanced |

Enforced via `quotaEnforcement.ts` middleware using `DailyUsage` table.

### Key Data Flow: Prompt Enhancement
1. iOS `PromptViewModel.enhance()` → `APIClient.request("/prompts/enhance")`
2. Backend `promptRouter` → `quotaEnforcement` check → `deepseekService.enhance()`
3. DeepSeek API call → response stored in `Prompt` table → returned to iOS
4. iOS updates UI, saves to history via `PromptHistoryManager`

## Environment Variables

### Backend (see `backend/.env.example`)
Required:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - 64+ char secrets
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` - Sign In with Apple
- `APPLE_ISSUER_ID`, `APPLE_BUNDLE_ID` - App Store Server API
- `DEEPSEEK_API_KEY` - AI prompt enhancement

### Web
- `NEXT_PUBLIC_API_URL` - Backend URL
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Web payments

### iOS
- Backend URL hardcoded in `APIClient.swift` (line 17)
- Bundle ID: `com.res.promptomizer`

## Deployment

- **Backend**: Railway (Docker) - auto-deploys from main
- **Web**: Vercel - auto-deploys from main
- **iOS**: App Store via Xcode Archive + `ExportOptions.plist`

See `PRODUCTION_SETUP.md` for Firebase, GitHub Actions secrets, and verification checklist.

## Code Patterns

### Backend
- ESM modules (`"type": "module"` in package.json)
- TypeScript strict mode
- Zod for request validation in routes
- Pino for structured JSON logging
- Webhook idempotency via `WebhookIdempotencyKey` table

### iOS
- MVVM with `@Observable` macro (iOS 17+)
- `@MainActor` for all UI-related classes
- `actor APIClient` for thread-safe networking
- Shared Keychain access group for widget extension
- StoreKit 2 for subscriptions

### Web
- React Query for server state
- Zustand for client state
- `jose` for JWT handling client-side
