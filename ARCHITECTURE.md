# Architecture

This document describes the Promptomize system from 30,000 feet down to the layer where
decisions get made. It is intentionally opinionated — when a future change has to choose
between consistency with this document and consistency with the code, choose the code,
update the document.

> **Companion documents:**
> [`README.md`](./README.md) — quick start and repository tour ·
> [`CLAUDE.md`](./CLAUDE.md) — engineering rules ·
> [`AGENTS.md`](./AGENTS.md) — equivalent guidance for Codex agents ·
> [`backend/README.md`](./backend/README.md) · [`web/README.md`](./web/README.md) ·
> [`Prompt/README.md`](./Prompt/README.md).

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Core Domains](#2-core-domains)
3. [Trust Boundaries & Auth](#3-trust-boundaries--auth)
4. [The Enhancement Pipeline](#4-the-enhancement-pipeline)
5. [Two Subscription Systems](#5-two-subscription-systems)
6. [Real-Time Layer](#6-real-time-layer)
7. [Background Processing](#7-background-processing)
8. [Data Model](#8-data-model)
9. [Webhook Idempotency](#9-webhook-idempotency)
10. [Failure Modes](#10-failure-modes)
11. [Deployment Topology](#11-deployment-topology)
12. [Decision Log](#12-decision-log)

---

## 1. System Context

```
                 ┌──────────────────────────────────────────────────────┐
                 │                       Users                          │
                 │   iOS · iPadOS · Web · Custom Keyboard · Widgets ·   │
                 │      Live Activities · ChatGPT Apps · Developer API  │
                 └──────────────────────────────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
       ┌──────▼──────┐            ┌───────▼───────┐           ┌───────▼────────┐
       │  iOS App    │            │   Web App     │           │ Enterprise API │
       │  SwiftUI    │            │  Next.js 14   │           │   (X-API-Key)  │
       │  StoreKit 2 │            │  PWA · SSR    │           │  Stripe billed │
       └──────┬──────┘            └───────┬───────┘           └───────┬────────┘
              │                           │                           │
              └───────────────────────────┼───────────────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │       Express REST API        │
                          │       /api/v1/* (Railway)     │
                          └───────────────┬───────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
┌───────────────┐              ┌─────────────────────┐              ┌──────────────┐
│   Postgres    │              │  Redis · BullMQ ·   │              │   AI APIs    │
│   Prisma 5    │◀────reads────│  Socket.IO pub/sub  │              │  DeepSeek    │
│   40+ models  │   /writes    │                     │              │  Anthropic   │
└───────────────┘              └─────────────────────┘              │  OpenAI      │
                                                                    │  Gemini      │
                                                                    └──────────────┘
```

External dependencies:

- **Apple App Store Connect / StoreKit 2** — iOS purchases, ASSN webhooks.
- **Stripe** — web subscriptions and Enterprise API billing.
- **Apple Sign-In + Google OAuth** — primary auth providers.
- **Resend** — transactional email.
- **Firebase Analytics + Crashlytics** — iOS telemetry.
- **Sentry** — backend error reporting (optional).

---

## 2. Core Domains

| Domain | Lives in | Owns |
|--------|----------|------|
| **Identity** | `backend/src/services/authService.ts`, `Prompt/Services/AuthManager.swift`, `web/lib/api/client.ts` | Sign-in flows, JWT issuance/refresh, session lifecycle |
| **Enhancement** | `backend/src/services/promptEnhancementEngine.ts` + `backend/src/services/metaPrompts/` | Modality + platform selection, multi-provider orchestration, SSE streaming |
| **Threads** | `backend/src/routes/threads.ts`, `Prompt/ViewModels/ThreadViewModel.swift` | Multi-turn conversations with shared context |
| **App subscriptions** | `backend/src/services/subscriptionService.ts`, `Prompt/Services/StoreKitManager.swift`, `web/app/api/stripe/*` | FREE / PRO / PREMIUM tier — StoreKit + Stripe |
| **Enterprise API** | `backend/src/services/apiSubscriptionService.ts`, `backend/src/routes/publicApi.ts` | API_FREE / API_STARTER / API_PRO / API_ENTERPRISE — Stripe-only |
| **Quota** | `backend/src/middleware/quotaEnforcement.ts`, `apiQuotaEnforcement.ts` | Daily/monthly usage tracking, gating before service calls |
| **Support** | `backend/src/services/supportService.ts`, `Prompt/Services/SupportSocketManager.swift` | Ticketed chat with Socket.IO |
| **Library** | `collections.ts`, `templates`, `contexts.ts`, `variations.ts`, `workflows.ts` | User-organised prompt assets |
| **Sandbox** | `backend/src/services/sandboxService.ts` | Run a single prompt across N platforms in parallel |

---

## 3. Trust Boundaries & Auth

The system has four distinct trust boundaries:

1. **End user → Express API** — JWT bearer token in `Authorization: Bearer …`.
2. **Developer → Public API** — `X-API-Key` header, validated against `ApiKey` table.
3. **Internal admin → Express API** — `X-Admin-API-Key` header, single shared secret.
4. **Stripe / Apple → Express API** — webhook signature verification + idempotency.

### iOS auth lifecycle

```
┌──────────────────┐
│ AuthView         │
│ "Sign in"        │
└────────┬─────────┘
         │ Apple Sign-In returns
         │ identityToken + authorizationCode
         ▼
┌──────────────────┐    POST /api/v1/auth/apple    ┌────────────────────┐
│ AuthManager      │ ────────────────────────────▶ │ authService.signIn │
│ Swift            │                               │  Apple             │
└──────────────────┘                               └────────┬───────────┘
         ▲                                                  │
         │ access (15 min) + refresh (7 d) JWT              │
         │ stored in shared Keychain                        │
         │                                                  │
         └─────────── SharedKeychainHelper ◀────────────────┘
                  (App Group: group.com.res.promptomizer)
                          │
                          ▼
            Widgets + Keyboard read tokens here
```

`actor APIClient` checks token expiry on every request; it refreshes once on a 401 and
falls back to sign-out only if the refresh also fails. Refreshes are coalesced — a single
refresh promise serves all in-flight callers.

### Web auth lifecycle

- Access token in `sessionStorage` (cleared on tab close).
- Refresh token as `HttpOnly` cookie (set by the backend, used by the Edge middleware
  for redirects but never read by client JS).
- `lib/api/client.ts` mirrors the iOS refresh behaviour.

---

## 4. The Enhancement Pipeline

The single most important flow in the system. Trace it end-to-end before you change it.

```
iOS / Web Client
      │  POST /api/v1/prompts/enhance
      │  { input, modality, platform, options }
      ▼
┌─────────────────────────────┐
│ middleware/auth.ts          │  Validates JWT → req.user
└────────────┬────────────────┘
             ▼
┌─────────────────────────────┐
│ middleware/quotaEnforcement │  Checks DailyUsage vs Subscription tier
└────────────┬────────────────┘
             ▼
┌─────────────────────────────┐
│ routes/prompts.ts           │  Zod validates body → calls engine
└────────────┬────────────────┘
             ▼
┌─────────────────────────────┐
│ services/                   │
│ promptEnhancementEngine.ts  │
│   ├─ pick modality builder  │  metaPrompts/modalities/{text,image,video,audio,code,3d}
│   ├─ pick platform overlay  │  metaPrompts/platforms/{midjourney,dalle,…}
│   ├─ build messages         │
│   ├─ select provider        │  DeepSeek (default) or Anthropic / OpenAI / Gemini
│   ├─ stream completions     │  Server-Sent Events
│   └─ persist Prompt row     │
└────────────┬────────────────┘
             ▼
   res.write(`data: …\n\n`)   per-token
   res.end()                  on completion
             ▼
Client streams SSE → updates UI incrementally → saves to history
```

Provider selection is keyed by:

1. Explicit override in the request (admin only).
2. The user's tier (Premium uses the highest-quality provider).
3. The modality (image-related modalities skip text-only providers).
4. Health/cost circuit breakers (a provider that has been rate-limited recently is
   demoted for the rest of the request).

Meta-prompts live in `services/metaPrompts/`:

- `modalities/text.ts`, `image.ts`, `video.ts`, `audio.ts`, `code.ts`, `3d.ts` — define
  the system prompt scaffold for each output type.
- `platforms/<name>.ts` — overlay platform-specific constraints (Midjourney parameter
  syntax, DALL·E aspect ratio, Suno tag conventions, etc.).

Streaming back to the client uses the `text/event-stream` content type. The client
incrementally renders deltas; on `done`, the full result is persisted server-side and
echoed back to the client for cache consistency.

---

## 5. Two Subscription Systems

This is the single most common source of confusion. **They are not the same system.**

| | App subscriptions | Enterprise API subscriptions |
|---|---|---|
| Audience | End users (iOS + web) | Developers building on the API |
| Model | `Subscription` (links to `User`) | `ApiSubscription` (links to `Developer`) |
| Tiers | FREE · PRO · PREMIUM | API_FREE · API_STARTER · API_PRO · API_ENTERPRISE |
| Quota | `DailyUsage` table, daily reset | `ApiUsage` table, monthly window |
| Enforcement | `middleware/quotaEnforcement.ts` | `middleware/apiQuotaEnforcement.ts` |
| Auth | JWT bearer | `X-API-Key` header |
| Routes | `/api/v1/subscriptions`, `/api/v1/webhooks` | `/api/v1/api-subscriptions`, `/api/v1/webhooks/api-stripe` |
| Billing | StoreKit 2 (iOS) + Stripe (web) | Stripe only |
| Webhooks | App Store Server Notifications + Stripe | Stripe only |
| Routes the client touches | `routes/subscriptions.ts`, `routes/webhooks.ts` | `routes/apiSubscriptions.ts`, `routes/apiStripeWebhook.ts` |

**Never** add a foreign key from one model to the other. They are intentionally
isolated. A single human who is both an end user and a developer holds two separate
records.

---

## 6. Real-Time Layer

### Server-Sent Events (SSE)

Used for prompt enhancement streaming. Initiated by `Express.Response#write()` against
a `text/event-stream` response. The client reads it via the `EventSource` API on web or
a custom `URLSession` parser on iOS (`APIClient.swift`).

### Socket.IO

Used for support chat and notification fan-out. Initialised in
`backend/src/utils/socket.ts` and attached to the same `httpServer` as Express. Redis
pub/sub is used as the adapter for horizontal scaling.

### Live Activities (iOS)

Started by the main app when an enhancement begins; updated by the same app as the SSE
stream produces tokens; ended on completion or failure. Defined in
`PromptWidgetExtension/EnhancementLiveActivity.swift` but driven from the main target.

---

## 7. Background Processing

`backend/src/utils/queue.ts` configures BullMQ queues:

- `enhancement-jobs` — async variations and workflows that exceed the request budget.
- `notifications` — APNs / email fan-out.
- `webhooks` — outbound webhook delivery to enterprise API customers.
- `idempotency-cleanup` — hourly sweep of expired `WebhookIdempotencyKey` rows.

Workers run inside the same Node process (no separate worker dyno). For higher load,
detach workers to a separate Railway service that connects to the same Redis URL.

---

## 8. Data Model

40+ Prisma models — see [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma)
for the complete definition. Highlights:

```
User ───┬───▶ Subscription           (1:1)  — app tier
        ├───▶ DailyUsage             (1:N)  — per-day quota
        ├───▶ Prompt                 (1:N)  — owned prompts
        ├───▶ Thread ─────▶ Message  (1:N)  — multi-turn conversations
        ├───▶ Collection             (1:N)  — folders
        ├───▶ Template               (1:N)  — saved templates
        ├───▶ Context                (1:N)  — reusable project context
        ├───▶ SupportTicket          (1:N)  — support inbox
        └───▶ Variation              (1:N)  — A/B testing

Developer ─┬─▶ ApiSubscription       (1:1)  — enterprise tier
           ├─▶ ApiKey                (1:N)  — issued credentials
           └─▶ ApiUsage              (1:N)  — monthly billing window

WebhookIdempotencyKey                       — SHA-256 dedup with 24h TTL
Platform                                    — built-in platform presets
Workflow ───▶ WorkflowStep                  — multi-step prompt programs
```

Every foreign key on a hot read path has an explicit index. Every enum-shaped column
uses a Prisma `enum`.

---

## 9. Webhook Idempotency

Stripe and Apple both replay webhooks. Failure to dedupe = duplicate billing or
duplicate entitlement grants.

The contract:

1. Compute `key = sha256(provider + ':' + provider_event_id)`.
2. Insert into `WebhookIdempotencyKey` with `ON CONFLICT DO NOTHING`.
3. If the insert returned 0 rows, the event has already been processed — return 200
   without side effects.
4. Otherwise, run the handler. If it throws, leave the row in place (so retries are
   still deduped) but return 500 so the provider retries with backoff.
5. The hourly cleanup scheduler deletes rows older than 24 hours.

The `idempotency.ts` middleware encapsulates this. Every webhook handler must use it
or document why it shouldn't.

---

## 10. Failure Modes

| Failure | Detection | Response |
|---------|-----------|----------|
| AI provider rate-limited | HTTP 429 from provider | Provider demoted in selection scorecard for the rest of the request; engine retries with the next provider |
| AI provider 5xx | HTTP 5xx from provider | Same as above; user sees a degraded but successful response |
| All providers fail | All retries exhausted | Engine throws `ProviderUnavailableError`; route returns 503 with retry-after; quota is **not** decremented |
| JWT expired mid-stream | 401 mid-SSE | iOS / web client refreshes once and replays the request; user sees a brief loading state |
| Stripe webhook replay | Idempotency key matches | Handler short-circuits with 200 |
| Apple webhook replay | Idempotency key matches | Same |
| Postgres connection lost | Prisma error | Process keeps running (HTTP server is up); subsequent requests retry; Railway restart policy fires after 10 consecutive failures |
| Redis unavailable | Connection error | BullMQ queue jobs fail-open (warn but don't block the request); Socket.IO degrades (no pub/sub) |
| StoreKit transaction unverified | Apple verify fails | iOS shows a generic purchase-failed alert; backend does not grant entitlement |

The system intentionally degrades rather than fails closed for non-critical paths
(Redis, queues, Socket.IO). Critical paths (auth, quota, billing) fail closed.

---

## 11. Deployment Topology

```
                                ┌───────────────────────┐
                                │  GitHub Actions CI    │
                                │  build · test · ship  │
                                └───────────┬───────────┘
                                            │
            ┌───────────────────────────────┼─────────────────────────────────┐
            │                               │                                 │
   ┌────────▼────────┐            ┌─────────▼──────────┐            ┌─────────▼────────┐
   │ Railway         │            │ Vercel             │            │ App Store        │
   │ Backend Docker  │            │ Web (Next.js)      │            │ TestFlight + ASC │
   │ Region: us-east │            │ Region: iad1       │            │                  │
   └────────┬────────┘            └─────────┬──────────┘            └──────────────────┘
            │                               │
            ▼                               ▼
   ┌─────────────────┐            ┌──────────────────┐
   │ Postgres        │            │ Vercel CDN       │
   │ (Railway / pool)│            │ (static + SSR)   │
   └─────────────────┘            └──────────────────┘
            │
            ▼
   ┌─────────────────┐
   │ Redis           │
   │ (Railway)       │
   └─────────────────┘
```

The backend Dockerfile is multi-stage Debian (`node:20-slim`) and runs as a non-root
`expressjs` user. Health checks live at `/health` and `/health/ready`.

---

## 12. Decision Log

The decisions worth carrying forward:

| Decision | Date | Reason |
|----------|------|--------|
| **ESM + NodeNext** | 2026-01 | First-class ESM support in Node 20; aligns with modern OpenAI / Anthropic SDKs. Cost: every relative import needs `.js`. Worth it. |
| **DeepSeek as primary** | 2026-01 | Best cost-per-quality at the time. Fallbacks remain because DeepSeek occasionally rate-limits. |
| **Two subscription systems** | 2026-01 | App users and developers have entirely different needs. Mixing them produced bugs in the early prototypes. |
| **JWT in shared Keychain** | 2026-01 | Necessary for widget + keyboard extensions to operate without re-auth. |
| **`actor APIClient`** | 2026-01 | Solves the "two parallel widget reloads racing on token refresh" class of bugs cleanly. |
| **No NSFW modality** | 2026-03 | Apple App Store guideline 1.1 review rejection. Removed entirely (modality + toggle). |
| **No third-party AI brand names in store metadata** | 2026-03 | Regional review (notably China) rejects for these. Use generic copy. |
| **Idempotency table over inline `Map<>` cache** | 2026-01 | Process restarts must not re-process webhooks. The cost of an extra DB write is trivial. |
| **Pino + named loggers** | 2026-01 | Structured JSON ships cleanly into Railway log streams. Named loggers (`webhookLogger`, `subscriptionLogger`) make filtering easy. |
| **Strict `noUncheckedIndexedAccess`** | 2026-01 | Prevents whole categories of `undefined` bugs. The `process.env['NAME']` syntax is the small price. |
