# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Promptomize is a full-stack prompt enhancement app with three components:
- **backend/** - Node.js/Express REST API (TypeScript, Prisma, PostgreSQL)
- **web/** - Next.js marketing site (React, TailwindCSS)
- **Prompt/** - iOS app (SwiftUI, StoreKit 2)

## Common Commands

### Backend (in `backend/`)
```bash
npm install                # Install dependencies
npm run dev                # Development server with hot-reload (port 3000)
npm run build              # Compile TypeScript to dist/
npm start                  # Run production build

# Database (Prisma)
npm run db:generate        # Generate Prisma client after schema changes
npm run db:push            # Push schema to database (dev)
npm run db:migrate         # Run migrations (production)
npm run db:studio          # Open Prisma Studio GUI
```

### Web (in `web/`)
```bash
npm install
npm run dev                # Next.js dev server
npm run build              # Production build
npm run lint               # ESLint
```

### iOS (in `Prompt/`)
```bash
# Build for simulator
xcodebuild -scheme Prompt -destination 'platform=iOS Simulator,name=iPhone 16 Pro Max' build

# Open in Xcode
open Prompt.xcodeproj
```

## Architecture

### API Structure (backend)
```
/api/v1/auth          - Apple/Google OAuth, token refresh, logout
/api/v1/prompts       - CRUD for enhanced prompts
/api/v1/users         - Profile, usage stats
/api/v1/subscriptions - IAP verification, status, billing
/api/v1/webhooks      - App Store Server notifications
```

### Authentication Flow
1. iOS initiates Apple Sign-In, receives identity token + auth code
2. Backend `/auth/apple` verifies with Apple, creates/updates user
3. Returns JWT access token (15min) + refresh token (7 days)
4. iOS stores tokens in Keychain via `KeychainHelper`
5. `APIClient` auto-refreshes expired tokens

### Subscription Tiers
- **FREE**: 10 daily prompts, basic quality, 4k tokens
- **PRO**: 100 daily prompts, standard quality, 8k tokens
- **PREMIUM**: Unlimited, advanced quality, 64k tokens

### Key Services

**Backend:**
- `authService.ts` - OAuth verification, JWT generation
- `appleStoreService.ts` - App Store Server API for IAP
- `quotaEnforcement.ts` - Middleware for tier-based limits

**iOS:**
- `AuthManager` - Sign-in state, Apple/Google OAuth
- `APIClient` - Actor-based HTTP client with token management
- `StoreKitManager` - IAP purchases, entitlements
- `DeepseekService` - AI prompt enhancement

### Database Models (Prisma)
Core: `User`, `Session`, `Prompt`, `Subscription`, `AppStoreTransaction`, `DailyUsage`

## Environment Variables

Backend requires (see `backend/.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID` - Sign In with Apple
- `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_ISSUER_ID` - App Store Server API
- `DEEPSEEK_API_KEY` - Prompt enhancement

## Deployment

- **Backend**: Railway (Docker) - auto-deploys from main
- **Web**: Vercel - auto-deploys from main
- **iOS**: App Store via Xcode Archive + ExportOptions.plist

## Code Patterns

**Backend:**
- ESM modules with TypeScript strict mode
- Service pattern for business logic
- Zod for request validation
- Consistent error responses via `errorHandler` middleware

**iOS:**
- MVVM with `@Observable` macro
- `@MainActor` for all UI-related classes
- `actor APIClient` for thread-safe networking
- AAA accessibility compliant colors in `Theme/`
