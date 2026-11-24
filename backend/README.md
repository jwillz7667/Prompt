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

| Concern        | Choice                                                              |
| -------------- | ------------------------------------------------------------------- |
| Runtime        | Node.js 20 (ESM, NodeNext module resolution)                        |
| Language       | TypeScript 5.6, `strict` + `noUncheckedIndexedAccess`               |
| Web framework  | Express 4                                                           |
| Validation     | Zod at every route boundary                                         |
| ORM            | Prisma 5 (PostgreSQL 16)                                            |
| Cache / queues | Redis 5 + BullMQ 5                                                  |
| Realtime       | Socket.IO 4 (Redis pub/sub adapter)                                 |
| Auth           | Apple Sign-In, Google OAuth, JWT pair (15 min access / 7 d refresh) |
| Payments       | Apple StoreKit 2 (verify), Stripe (web + enterprise API)            |
| Logging        | Pino (structured JSON, named loggers)                               |
| Email          | Resend                                                              |
| AI providers   | DeepSeek (primary), Anthropic, OpenAI, Google Gemini                |
| Container      | Multi-stage Debian Node 20-slim, non-root runtime user              |

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

| Variable                                                                   | Purpose                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                                                             | Postgres connection string (with `connection_limit` for production) |
| `DATABASE_DIRECT_URL`                                                      | Bypasses pooler for migrations                                      |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                                 | 64-char base64 secrets (`openssl rand -base64 64`)                  |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Apple Sign-In audience, APNs key                                    |
| `APPLE_IAP_ISSUER_ID` / `APPLE_IAP_KEY_ID` / `APPLE_IAP_PRIVATE_KEY`       | App Store Server API (status reconciliation, history)               |
| `APPLE_BUNDLE_ID` / `APPLE_APP_ID`                                         | Signed transaction / notification verification                      |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                | Google OAuth                                                        |
| One provider key in `LLM_PROVIDER_CHAIN` (e.g. `LLM_DEEPSEEK_API_KEY`)     | `/health` reports a config error only when no provider is usable    |
| `BACKEND_WEBHOOK_SECRET`                                                   | HMAC for Next.js → Express webhook forwarding                       |

Optional / scaling variables:

| Variable                                                      | Purpose                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `REDIS_URL`                                                   | Required for BullMQ + Socket.IO pub/sub + rate-limit storage |
| `RESEND_API_KEY` / `FROM_EMAIL` / `SUPPORT_EMAIL` / `APP_URL` | Transactional email                                          |
| `SENTRY_DSN`                                                  | Error reporting                                              |
| `CORS_ORIGIN`                                                 | Comma-separated origin allowlist additions                   |
| `RATE_LIMIT_*`                                                | Tier-specific rate limit overrides                           |

### LLM gateway

All AI text and vision calls go through `src/features/llm` (provider chain,
first-token failover, Redis-shared circuit breaker). Config is Zod-parsed once
at boot by `validateLlmConfig()`; malformed values stop the boot, missing
credentials only skip that provider. Runbook, home-GPU setup and cost table:
[`docs/AI-OPERATIONS.md`](../docs/AI-OPERATIONS.md).

| Variable                                                                      | Default                                                             | Purpose                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `LLM_PROVIDER_CHAIN`                                                          | `deepseek,openrouter`                                               | Ordered failover chain (`deepseek`, `openrouter`, `local`)                         |
| `LLM_DEEPSEEK_API_KEY` / `LLM_DEEPSEEK_BASE_URL` / `LLM_DEEPSEEK_MODEL`       | — / `https://api.deepseek.com` / `deepseek-flash`                   | Primary provider; key and model fall back to `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` |
| `LLM_OPENROUTER_API_KEY` / `LLM_OPENROUTER_BASE_URL` / `LLM_OPENROUTER_MODEL` | — / `https://openrouter.ai/api/v1` / `deepseek/deepseek-v4.1-flash` | Fallback provider                                                                  |
| `LLM_OPENROUTER_PROVIDER_PREFS`                                               | unset                                                               | JSON passed as the request `provider` routing object                               |
| `LLM_LOCAL_BASE_URL` / `LLM_LOCAL_API_KEY` / `LLM_LOCAL_MODEL`                | unset                                                               | Self-hosted OpenAI-compatible endpoint (all three required)                        |
| `LLM_LOCAL_CF_ACCESS_CLIENT_ID` / `LLM_LOCAL_CF_ACCESS_CLIENT_SECRET`         | unset                                                               | Cloudflare Access service token headers for the local endpoint                     |
| `LLM_<PROVIDER>_SUPPORTS_IMAGES`                                              | deepseek `true`, others `false`                                     | Whether image turns may be routed to that provider                                 |
| `LLM_TTFT_TIMEOUT_MS` / `LLM_IDLE_TIMEOUT_MS` / `LLM_TOTAL_TIMEOUT_MS`        | `15000` / `60000` / `180000`                                        | First-token (failover trigger), stream-stall and hard deadlines                    |
| `LLM_BREAKER_LONG_COOLDOWN_MS`                                                | `300000`                                                            | Breaker open time after 401/402                                                    |
| `LLM_LAST_PROVIDER_RETRIES`                                                   | `1`                                                                 | Retries on the last provider for transient failures                                |
| `PROMPT_VISION_PROVIDER`                                                      | `deepseek`                                                          | `deepseek` = gateway vision; `openai` = dedicated vision model                     |

### Subscriptions, paywall and daily usage

Every app route that can reach a model runs `requireEntitlement` (403
`{code:'QUOTA_EXCEEDED', reason:'SUBSCRIPTION_REQUIRED'}` for non-subscribers).
The gate only reads today's count. Each provider call is then **reserved**
on the user's `DailyUsage` row with one atomic upsert-increment before the
call, and returned only if nothing was delivered. Streams count as charged
once a token reaches the client. Workflows, sandbox tests and variations
reserve per provider call.

| Variable                             | Default | Purpose                                                                                     |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------- |
| `HARD_PAYWALL_ENABLED`               | `true`  | Rollback switch (see below)                                                                 |
| `FREE_DAILY_PROMPT_LIMIT`            | `10`    | Legacy free generations per UTC day, only while the paywall is off                          |
| `PREMIUM_DAILY_GENERATION_SOFT_CAP`  | `300`   | Subscriber fair-use ceiling per UTC day (`429 FAIR_USE_LIMIT`)                              |
| `SUPPORT_AI_DAILY_LIMIT`             | `20`    | Support-assistant replies per UTC day; support needs no subscription                        |
| `APPLE_ACCEPT_SANDBOX_TRANSACTIONS`  | `true`  | Accept App Review / TestFlight (Sandbox) purchases at all                                   |
| `APPLE_SANDBOX_ACCOUNT_MAX_AGE_DAYS` | `14`    | Sandbox purchases unlock only accounts younger than this (App Review uses a fresh Apple ID) |
| `APPLE_SANDBOX_ALLOWED_USER_IDS`     | empty   | Comma-separated internal testers whose Sandbox purchases always unlock                      |

**`HARD_PAYWALL_ENABLED` rollout and cleanup.** It ships `true` together with
the iOS hard-paywall build. If conversion or App Review forces a rollback,
set it to `false` in Railway and restart: non-subscribers get
`FREE_DAILY_PROMPT_LIMIT` generations a day again, with no deploy. Once the
paywall build has been live for one full release with the flag untouched,
remove the flag, the legacy-allowance branch in `requireEntitlement` /
`generationDailyLimit`, and `FREE_DAILY_PROMPT_LIMIT`, and drop the `PRO`
enum value in the same release.

**Sign in with Apple revocation.** `APPLE_SIWA_KEY_ID`,
`APPLE_SIWA_PRIVATE_KEY` (a key with Sign in with Apple enabled) and
`APPLE_SIWA_TOKEN_ENCRYPTION_KEY` (32 bytes, base64) let the backend exchange
the sign-in authorization code for a refresh token and store it encrypted
(AES-256-GCM). It is revoked when the account is deleted, as guideline
5.1.1(v) requires. A failed revoke is queued in `AppleTokenRevocation` and
retried every 15 minutes, so deletion never blocks. Set all three keys or
none: a partial set fails boot, and none logs that revocation is disabled.

**Developer API.** `/api/v1/public/*` is a separately billed product
outside the app paywall ([ADR 0001](../docs/adr/0001-developer-api-free-tier.md)).
`API_FREE_MONTHLY_REQUESTS` (default `25`) sets the free allowance.
`DEVELOPER_SIGNUPS_PER_IP_PER_HOUR` (default `5`) throttles signups.

### Chat

`src/features/chat` serves the general-purpose chatbot at `/api/v1/chat`
(conversations CRUD, SSE replies, regenerate, report). Message-creating routes
require an active subscription (`requireEntitlement`); reading, renaming,
deleting and reporting need only sign-in. Replies stream through the LLM
gateway with the client-disconnect signal, so a stopped reply aborts upstream
and is saved as `stopped`.

What happens when a reply fails:

- **Before `start`:** nothing is stored and the daily slot is refunded.
- **After `start` but before any output:** the user's message is kept and the
  empty reply is saved as `failed`. The client retries it with regenerate.
  A failed regenerate keeps the reply it was replacing.
- **Regenerate:** only allowed on the newest visible message. Otherwise the
  route returns `409 {error, code:'NOT_LATEST_MESSAGE'}`. A reused
  `clientMessageId` returns `409 {error, code:'DUPLICATE_MESSAGE'}`.
- **Saving:** a reply, the removal of the reply it replaces, and the
  conversation bump commit in one transaction.

Moderation runs at two points: on user messages before the model is called,
and on finished replies before they are saved. Flagged text gets a fixed
response:

- Sexual content involving minors gets a refusal.
- Self-harm intent gets supportive copy with crisis resources (988,
  findahelpline.com).
- Explicit sexual content, threatening hate or harassment, graphic violence
  and violent wrongdoing get a refusal.

A replaced reply is sent in `complete.content`. Reports keep a snapshot of
the reported text, so they outlive the message. The conversation list cursor
is opaque. `CHAT_*` values are Zod-parsed when the router is built at boot.

| Variable                    | Default | Purpose                                                              |
| --------------------------- | ------- | -------------------------------------------------------------------- |
| `CHAT_MAX_OUTPUT_TOKENS`    | `2048`  | Output cap per reply (`length` finish → status `truncated`)          |
| `CHAT_CONTEXT_TOKEN_BUDGET` | `12000` | History budget per turn (Latin ~4 chars/token, CJK 1 token/char)     |
| `CHAT_DAILY_MESSAGE_LIMIT`  | `150`   | Replies per user per UTC day (`429 FAIR_USE_LIMIT`)                  |
| `CHAT_MODERATION_ENABLED`   | `true`  | Input + output moderation; needs `OPENAI_API_KEY` (boot log if off)  |
| `OPENAI_API_KEY`            | unset   | Also used for the free moderation endpoint (2 s timeout, fails open) |

Env vars are read with bracket notation (`process.env['NAME']`) because of
`noUncheckedIndexedAccess`. Do not introduce dot-notation reads.

---

## Scripts

| Script                                    | What it does                                              |
| ----------------------------------------- | --------------------------------------------------------- |
| `npm run dev`                             | Hot-reloading dev server via `tsx watch`                  |
| `npm run build`                           | `tsc` → `dist/`                                           |
| `npm start`                               | Run the compiled JS (`node dist/index.js`)                |
| `npm run typecheck`                       | `tsc --noEmit`                                            |
| `npm run lint` / `npm run lint:fix`       | ESLint over `src/**/*.ts`                                 |
| `npm run format` / `npm run format:check` | Prettier write / check                                    |
| `npm run db:generate`                     | Regenerate Prisma client                                  |
| `npm run db:migrate:dev`                  | Create + apply a dev migration                            |
| `npm run db:migrate`                      | Apply migrations in production                            |
| `npm run db:push`                         | Push schema **without migration** (dev only — never prod) |
| `npm run db:studio`                       | Launch Prisma Studio                                      |
| `npm run db:reset`                        | Reset and re-apply migrations (dev only — destroys data)  |
| `npm run clean`                           | Remove `dist/` and TS build info                          |

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

| Path                    | Module                    | Notes                                   |
| ----------------------- | ------------------------- | --------------------------------------- |
| `/health`               | `routes/health.ts`        | Liveness + readiness probes             |
| `/api/v1/auth`          | `routes/auth.ts`          | Apple/Google sign-in, refresh, logout   |
| `/api/v1/users`         | `routes/users.ts`         | Profile management                      |
| `/api/v1/prompts`       | `routes/prompts.ts`       | CRUD + `/enhance` (SSE-streamed)        |
| `/api/v1/threads`       | `routes/threads.ts`       | Multi-turn conversation threads         |
| `/api/v1/chat`          | `features/chat/`          | General-purpose chatbot (SSE replies)   |
| `/api/v1/collections`   | `routes/collections.ts`   | Folders for organising prompts          |
| `/api/v1/contexts`      | `routes/contexts.ts`      | Reusable project context                |
| `/api/v1/platforms`     | `routes/platforms.ts`     | Platform presets                        |
| `/api/v1/sandbox`       | `routes/sandbox.ts`       | Run a prompt against multiple platforms |
| `/api/v1/workflows`     | `routes/workflows.ts`     | Multi-step workflows                    |
| `/api/v1/variations`    | `routes/variations.ts`    | A/B prompt variations                   |
| `/api/v1/subscriptions` | `routes/subscriptions.ts` | StoreKit verify / Stripe checkout       |
| `/api/v1/webhooks`      | `routes/webhooks.ts`      | Apple App Store Server notifications    |
| `/api/v1/analytics`     | `routes/analytics.ts`     | Usage telemetry                         |
| `/api/v1/support`       | `routes/support.ts`       | Ticketed support + Socket.IO chat       |
| `/api/v1/admin`         | `routes/admin.ts`         | Admin endpoints (`X-Admin-API-Key`)     |

### Enterprise / Developer API

| Path                          | Module                       | Notes                                             |
| ----------------------------- | ---------------------------- | ------------------------------------------------- |
| `/api/v1/developer/auth`      | `routes/developerAuth.ts`    | Developer sign-in                                 |
| `/api/v1/api-keys`            | `routes/apiKeys.ts`          | API key issuance + rotation                       |
| `/api/v1/public`              | `routes/publicApi.ts`        | Public API (`X-API-Key`): enhance, history, usage |
| `/api/v1/api-subscriptions`   | `routes/apiSubscriptions.ts` | Enterprise billing tiers                          |
| `/api/v1/webhooks/api-stripe` | `routes/apiStripeWebhook.ts` | Stripe webhooks for API tier                      |
| `/api/v1/docs`                | `routes/docs.ts`             | OpenAPI / docs endpoints                          |

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
- Production URL: `https://backend-production-d7487.up.railway.app`.

For rollback, deploy a previous Railway build via the Railway dashboard or
`railway redeploy <deployment-id>`.
