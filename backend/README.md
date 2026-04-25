# Promptomize Backend

The TypeScript REST API that powers the iOS app, web app, and Enterprise developer
portal. Built on Express, Prisma, PostgreSQL, Redis, BullMQ, and Socket.IO.

[![Backend CI/CD](https://github.com/jwillz7667/Prompt/actions/workflows/backend.yml/badge.svg)](../.github/workflows/backend.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-339933?logo=node.js&logoColor=white)](../.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.json)

> **Looking for the high-level architecture?** Read [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
> For repository-wide context, see [`../README.md`](../README.md) and [`../CLAUDE.md`](../CLAUDE.md).

---

## Contents

1. [Stack](#stack)
2. [Project layout](#project-layout)
3. [Getting started](#getting-started)
4. [Environment variables](#environment-variables)
5. [Scripts](#scripts)
6. [Database & migrations](#database--migrations)
7. [API surface](#api-surface)
8. [Conventions](#conventions)
9. [Observability](#observability)
10. [Deployment](#deployment)

---

## Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js 20 (ESM, NodeNext module resolution) |
| Language | TypeScript 5.6, `strict` + `noUncheckedIndexedAccess` |
| Web framework | Express 4 |
| Validation | Zod at every route boundary |
| ORM | Prisma 5 (PostgreSQL 16) |
| Cache / queues | Redis 5 + BullMQ 5 |
| Realtime | Socket.IO 4 (Redis pub/sub adapter) |
| Auth | Apple Sign-In, Google OAuth, JWT pair (15 min access / 7 d refresh) |
| Payments | Apple StoreKit 2 (verify), Stripe (web + enterprise API) |
| Logging | Pino (structured JSON, named loggers) |
| Email | Resend |
| AI providers | DeepSeek (primary), Anthropic, OpenAI, Google Gemini |
| Container | Multi-stage Debian Node 20-slim, non-root runtime user |

---

## Project layout

```
backend/
├── src/
│   ├── index.ts                 App bootstrap: middleware chain + route mounting
│   ├── routes/                  23 route modules — thin handlers, parse → service → respond
│   ├── services/                Business logic (engine, providers, billing, support)
│   │   └── metaPrompts/
│   │       ├── modalities/      text · image · video · audio · code · 3d
│   │       └── platforms/       Midjourney, DALL·E, Stable Diffusion, Suno, ElevenLabs, …
│   ├── middleware/              auth · apiKeyAuth · quotaEnforcement · rate limit · idempotency · errorHandler
│   ├── utils/                   logger · prisma · redis · queue · socket · jwt
│   └── types/                   Shared TS ambient types
│
├── prisma/
│   ├── schema.prisma            40+ models (User, Prompt, Thread, Subscription, ApiSubscription, …)
│   └── migrations/              Generated Prisma migration history
│
├── Dockerfile                   Multi-stage build, non-root runtime
├── railway.json                 Railway deployment config
├── eslint.config.js             Flat ESLint config (TypeScript strict + import hygiene)
├── .prettierrc                  Formatter config
└── tsconfig.json                Strict TS with NodeNext + noUncheckedIndexedAccess
```

---

## Getting started

```bash
# From the repository root
nvm use                    # picks up ../.nvmrc → Node 20
cd backend
cp .env.example .env       # fill in the required secrets (see below)
npm ci
npm run db:generate
npm run db:push            # local DB only — never against production
npm run dev                # tsx watch on port 3000
```

The dev server hot-reloads on file changes via `tsx watch`. The HTTP server starts
immediately and does not block on the database — Prisma queries lazily. Socket.IO is
attached to the same HTTP server.

---

## Environment variables

The full inventory lives in [`.env.example`](./.env.example). Required variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (with `connection_limit` for production) |
| `DATABASE_DIRECT_URL` | Bypasses pooler for migrations |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 64-char base64 secrets (`openssl rand -base64 64`) |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Apple Sign-In + ASSN verification |
| `APPLE_BUNDLE_ID` / `APPLE_APP_ID` / `APPLE_ISSUER_ID` | App Store Server API |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `DEEPSEEK_API_KEY` | Primary AI provider |
| `BACKEND_WEBHOOK_SECRET` | HMAC for Next.js → Express webhook forwarding |

Optional / scaling variables:

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Required for BullMQ + Socket.IO pub/sub + rate-limit storage |
| `RESEND_API_KEY` / `FROM_EMAIL` / `SUPPORT_EMAIL` / `APP_URL` | Transactional email |
| `SENTRY_DSN` | Error reporting |
| `CORS_ORIGIN` | Comma-separated origin allowlist additions |
| `RATE_LIMIT_*` | Tier-specific rate limit overrides |

Env vars are read with bracket notation (`process.env['NAME']`) because of
`noUncheckedIndexedAccess`. Do not introduce dot-notation reads.

---

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Hot-reloading dev server via `tsx watch` |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | Run the compiled JS (`node dist/index.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run lint:fix` | ESLint over `src/**/*.ts` |
| `npm run format` / `npm run format:check` | Prettier write / check |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate:dev` | Create + apply a dev migration |
| `npm run db:migrate` | Apply migrations in production |
| `npm run db:push` | Push schema **without migration** (dev only — never prod) |
| `npm run db:studio` | Launch Prisma Studio |
| `npm run db:reset` | Reset and re-apply migrations (dev only — destroys data) |
| `npm run clean` | Remove `dist/` and TS build info |

---

## Database & migrations

- **40+ Prisma models** including `User`, `Prompt`, `Thread`, `ThreadMessage`,
  `Subscription` (app users), `ApiSubscription` (enterprise developers), `Developer`,
  `ApiKey`, `DailyUsage`, `WebhookIdempotencyKey`, `Collection`, `Template`, `Context`,
  and `SupportTicket`.
- The two subscription systems are **strictly separate** — different tables, different
  routes, different middleware, different billing surfaces.
- Migration workflow:
  - **Local development:** `npx prisma migrate dev --name <slug>` to create and apply.
  - **Production:** `npm run db:migrate` (`prisma migrate deploy`) — applies committed
    migrations only, never auto-generates.
  - **Never** run `npm run db:push` against production. It bypasses the migration
    history and can drop columns silently.

---

## API surface

All routes are mounted under `/api/v1/` from `src/index.ts`.

### App-facing API

| Path | Module | Notes |
|------|--------|-------|
| `/health` | `routes/health.ts` | Liveness + readiness probes |
| `/api/v1/auth` | `routes/auth.ts` | Apple/Google sign-in, refresh, logout |
| `/api/v1/users` | `routes/users.ts` | Profile management |
| `/api/v1/prompts` | `routes/prompts.ts` | CRUD + `/enhance` (SSE-streamed) |
| `/api/v1/threads` | `routes/threads.ts` | Multi-turn conversation threads |
| `/api/v1/collections` | `routes/collections.ts` | Folders for organising prompts |
| `/api/v1/contexts` | `routes/contexts.ts` | Reusable project context |
| `/api/v1/platforms` | `routes/platforms.ts` | Platform presets |
| `/api/v1/sandbox` | `routes/sandbox.ts` | Run a prompt against multiple platforms |
| `/api/v1/workflows` | `routes/workflows.ts` | Multi-step workflows |
| `/api/v1/variations` | `routes/variations.ts` | A/B prompt variations |
| `/api/v1/subscriptions` | `routes/subscriptions.ts` | StoreKit verify / Stripe checkout |
| `/api/v1/webhooks` | `routes/webhooks.ts` | Apple App Store Server notifications |
| `/api/v1/analytics` | `routes/analytics.ts` | Usage telemetry |
| `/api/v1/support` | `routes/support.ts` | Ticketed support + Socket.IO chat |
| `/api/v1/admin` | `routes/admin.ts` | Admin endpoints (`X-Admin-API-Key`) |

### Enterprise / Developer API

| Path | Module | Notes |
|------|--------|-------|
| `/api/v1/developer/auth` | `routes/developerAuth.ts` | Developer sign-in |
| `/api/v1/api-keys` | `routes/apiKeys.ts` | API key issuance + rotation |
| `/api/v1/public` | `routes/publicApi.ts` | Public API (`X-API-Key`): enhance, history, usage |
| `/api/v1/api-subscriptions` | `routes/apiSubscriptions.ts` | Enterprise billing tiers |
| `/api/v1/webhooks/api-stripe` | `routes/apiStripeWebhook.ts` | Stripe webhooks for API tier |
| `/api/v1/docs` | `routes/docs.ts` | OpenAPI / docs endpoints |

### Middleware order

```
helmet → cors → rate limit → compression → JSON body parser
  → request logger
  → auth.ts | apiKeyAuth.ts (per route)
  → quotaEnforcement.ts | apiQuotaEnforcement.ts (per route)
  → idempotency.ts (webhooks)
  → route handler
  → errorHandler.ts (terminal)
```

---

## Conventions

- ESM modules — relative imports **must** include the `.js` extension
  (`import { foo } from './bar.js'`).
- Routes are thin: parse with Zod, call a service, return a DTO. **Never** put business
  logic in route handlers.
- Use the named Pino loggers (`logger`, `promptLogger`, `subscriptionLogger`,
  `webhookLogger`). Never `console.log`.
- Webhook handlers are idempotent — every Stripe / Apple webhook checks
  `WebhookIdempotencyKey` first.
- Errors thrown inside route handlers are caught by `errorHandler.ts`. Throw
  domain-specific `Error` subclasses with explicit `statusCode`.

For the full coding standard, see [`../CLAUDE.md`](../CLAUDE.md) and
[`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## Observability

- **Structured logs:** Pino JSON output. In development, `pino-pretty` renders human-readable lines.
- **Request logging:** `requestLogger.ts` middleware emits `req`/`res` correlation IDs.
- **Health endpoint:** `/health` returns liveness; `/health/ready` checks DB + Redis.
- **Error tracking:** Sentry is wired in if `SENTRY_DSN` is set.
- **Graceful shutdown:** `SIGTERM` / `SIGINT` flush the idempotency-cleanup interval,
  close Redis + BullMQ + Prisma, and exit with code 0.

---

## Deployment

- Built and deployed automatically from `main` via
  [`.github/workflows/backend.yml`](../.github/workflows/backend.yml).
- Production target: Railway, Docker image built from [`Dockerfile`](./Dockerfile).
- The compiled image runs as the non-root `expressjs` user on port `3000`.
- Production URL: `https://backend-production-d538.up.railway.app`.

For rollback, deploy a previous Railway build via the Railway dashboard or
`railway redeploy <deployment-id>`.
