<div align="center">

# Promptomize

**An AI prompt enhancement platform for iOS, Web, and the Enterprise API.**

[![Backend CI/CD](https://github.com/jwillz7667/Prompt/actions/workflows/backend.yml/badge.svg)](https://github.com/jwillz7667/Prompt/actions/workflows/backend.yml)
[![Web CI/CD](https://github.com/jwillz7667/Prompt/actions/workflows/web.yml/badge.svg)](https://github.com/jwillz7667/Prompt/actions/workflows/web.yml)
[![iOS CI/CD](https://github.com/jwillz7667/Prompt/actions/workflows/ios.yml/badge.svg)](https://github.com/jwillz7667/Prompt/actions/workflows/ios.yml)
[![CodeQL](https://github.com/jwillz7667/Prompt/actions/workflows/codeql.yml/badge.svg)](https://github.com/jwillz7667/Prompt/actions/workflows/codeql.yml)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-339933?logo=node.js&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](backend/tsconfig.json)
[![Swift](https://img.shields.io/badge/Swift-6-FA7343?logo=swift&logoColor=white)](Prompt)
[![iOS](https://img.shields.io/badge/iOS-17%2B-000000?logo=apple&logoColor=white)](Prompt)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org)

[Website](https://promptomize.app) · [iOS App](https://apps.apple.com/us/app/promptomize/id6758075605) · [API Docs](https://promptomize.app/docs) · [Architecture](./ARCHITECTURE.md) · [Contributing](./CONTRIBUTING.md)

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Repository Layout](#repository-layout)
3. [Quick Start](#quick-start)
4. [Architecture at a Glance](#architecture-at-a-glance)
5. [Per-Component Documentation](#per-component-documentation)
6. [Tech Stack](#tech-stack)
7. [Development Workflow](#development-workflow)
8. [Deployment](#deployment)
9. [Quality, Security & Compliance](#quality-security--compliance)
10. [Project Conventions](#project-conventions)
11. [Support](#support)
12. [License](#license)

---

## Overview

Promptomize transforms raw user prompts into production-ready outputs tailored for a specific
modality (text, image, video, audio, code, 3D) and target platform (Midjourney, DALL·E, Stable
Diffusion, Runway, ElevenLabs, Suno, and many more). It ships as:

- **A native iOS app** with widget and keyboard extensions, Live Activities, and on-device
  history (SwiftUI + StoreKit 2 + SwiftData).
- **A web product** providing a marketing site, dashboard, admin console, and developer portal
  (Next.js 14 App Router + PWA).
- **An Express REST API** that orchestrates multi-provider AI enhancement with strict tier
  gating, idempotent webhooks, real-time chat, and background jobs (TypeScript + Prisma +
  PostgreSQL + Redis + BullMQ + Socket.IO).
- **An Enterprise API** with separate billing, API keys, and per-tier quotas for B2B usage.
- **A ChatGPT App** (Model Context Protocol server + React widget) under `chatgpt-app/`.

All components share a single source of truth for users, prompts, and subscriptions and follow
the conventions documented in [`CLAUDE.md`](./CLAUDE.md), [`AGENTS.md`](./AGENTS.md), and
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Repository Layout

```
.
├── backend/                       Express + TypeScript REST API (Prisma, Postgres, Redis, BullMQ)
│   ├── src/
│   │   ├── routes/                23 route modules mounted under /api/v1
│   │   ├── services/              Business logic (enhancement engine, provider adapters, billing)
│   │   │   └── metaPrompts/       Modality- and platform-specific meta-prompt builders
│   │   ├── middleware/            Auth, quota, rate-limit, idempotency, request logging
│   │   ├── utils/                 Logger, Prisma client, Redis, queues, Socket.IO bootstrap
│   │   └── index.ts               App entry point
│   ├── prisma/                    Schema + migrations (40+ models)
│   ├── Dockerfile                 Multi-stage Debian build with non-root runtime user
│   └── railway.json               Railway deployment config
│
├── web/                           Next.js 14 App Router product surface
│   ├── app/
│   │   ├── (marketing)/           Public landing pages
│   │   ├── (auth)/                Apple/Google sign-in flows
│   │   ├── (dashboard)/           Authenticated user dashboard
│   │   ├── admin/                 Admin console
│   │   ├── developers/            Enterprise API portal (auth + dashboard)
│   │   └── docs/                  Developer documentation site
│   ├── components/                ui/, layout/, hero/, shared/
│   ├── lib/                       api/ client, hooks/, stores/, types/, utils/
│   └── middleware.ts              Edge auth middleware + apex redirect
│
├── Prompt/                        iOS app target (SwiftUI + Swift 6)
│   ├── Views/                     Top-level screens (Thread, History, Profile, Sandbox, …)
│   ├── ViewModels/                @Observable, @MainActor view-models
│   ├── Components/                Reusable SwiftUI components
│   ├── Services/                  Networking, auth, StoreKit 2, persistence, sync, telemetry
│   ├── Models/                    DTOs and SwiftData @Model types
│   ├── Theme/                     Liquid Glass design tokens
│   ├── Intents/                   App Intents for Siri / Shortcuts
│   ├── Activities/                ActivityKit Live Activities
│   ├── Shared/                    Code shared with extensions (Keychain, App Group, types)
│   └── Configuration/
│
├── PromptWidgetExtension/         WidgetKit + Live Activities target
├── PromptKeyboard/                Custom keyboard extension target
├── PromptUITests/                 XCUITest snapshot tests (driven by Fastlane)
│
├── chatgpt-app/                   Standalone MCP server + React widget (Vite + Express)
│
├── fastlane/                      iOS distribution automation (snapshots + TestFlight)
├── scripts/                       Ruby helpers for Xcode project mutation
├── docs/                          Long-form documentation (GPT Actions, integration guides)
├── ui-images/                     Marketing screenshot artwork
│
├── .github/                       CI/CD workflows + PR/issue templates + CODEOWNERS
├── ARCHITECTURE.md                System design, data flows, sequence diagrams
├── CONTRIBUTING.md                Branching, PR, and review guidelines
├── SECURITY.md                    Vulnerability disclosure policy
├── CODE_OF_CONDUCT.md             Contributor Covenant v2.1
├── CHANGELOG.md                   Keep-a-Changelog history
├── CLAUDE.md                      Engineering rules for AI agents (also helpful for humans)
└── AGENTS.md                      Equivalent guidance for the Codex agent family
```

---

## Quick Start

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | `>= 20.0.0` | Pinned in [`.nvmrc`](./.nvmrc); use `nvm use` |
| npm | `>= 10` | Ships with Node 20 |
| PostgreSQL | `>= 14` | Local instance or Docker |
| Redis | `>= 6` (optional in dev) | Required for BullMQ queues, Socket.IO scaling |
| Xcode | `>= 16` | iOS 17 SDK or higher |
| Swift | `6.x` | Strict concurrency mode |
| Ruby | `>= 3.0` | Only needed for Fastlane / Xcode helper scripts |

### One-time setup

```bash
# 1. Clone and install hooks (if/when added)
git clone git@github.com:jwillz7667/Prompt.git
cd Prompt

# 2. Pin Node
nvm use                       # picks up .nvmrc

# 3. Backend
cd backend
cp .env.example .env          # then fill in required secrets
npm ci
npm run db:generate
npm run db:push               # local DB only — never run against production

# 4. Web
cd ../web
cp .env.example .env.local
npm ci

# 5. iOS (project root)
cd ..
open Prompt.xcodeproj
```

### Run the stack

```bash
# Terminal 1 — Backend (port 3000)
cd backend && npm run dev

# Terminal 2 — Web (port 3001 to avoid colliding with backend)
cd web && PORT=3001 npm run dev

# Xcode — iOS app (Cmd+R targeting an iPhone 16 simulator)
```

The iOS app expects the backend at the URL hardcoded in
`Prompt/Services/APIClient.swift`. Override it locally by setting
`Prompt/Configuration/Local.xcconfig` (gitignored) and rebuilding.

---

## Architecture at a Glance

```
                           ┌──────────────────────┐
                           │      iOS App         │
                           │  SwiftUI + StoreKit  │
                           │  Widget + Keyboard   │
                           └──────────┬───────────┘
                                      │  HTTPS / SSE
                                      │
┌──────────────┐                      ▼                     ┌──────────────┐
│   Web App    │ ◀──── Stripe ────▶ ┌─────────────────────┐ │ ChatGPT App  │
│  Next.js 14  │ ───────────────▶   │   Express API       │ │   MCP + UI   │
│   PWA · SSR  │                    │   /api/v1/*         │ ├──────────────┘
└──────────────┘                    │                     │
                                    │  Auth · Quota ·     │
                                    │  Idempotency ·      │
                                    │  Rate limit         │
                                    │                     │
                                    │  Enhancement Engine │
                                    │   ├─ DeepSeek (1°)  │
                                    │   ├─ Anthropic      │
                                    │   ├─ OpenAI         │
                                    │   └─ Gemini         │
                                    └────┬───────┬────────┘
                                         │       │
                                ┌────────▼┐    ┌─▼──────────┐
                                │ Postgres│    │   Redis    │
                                │ Prisma  │    │ BullMQ +   │
                                │ 40+ ORM │    │ Socket.IO  │
                                │ models  │    │ pub/sub    │
                                └─────────┘    └────────────┘
```

For sequence diagrams, the dual-subscription model, and the multi-provider enhancement
pipeline, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Per-Component Documentation

| Component | Location | Docs |
|-----------|----------|------|
| Backend API | [`backend/`](./backend) | [`backend/README.md`](./backend/README.md) |
| Web App | [`web/`](./web) | [`web/README.md`](./web/README.md) |
| iOS App | [`Prompt/`](./Prompt) | [`Prompt/README.md`](./Prompt/README.md) |
| Widget Extension | [`PromptWidgetExtension/`](./PromptWidgetExtension) | [`PromptWidgetExtension/README.md`](./PromptWidgetExtension/README.md) |
| Keyboard Extension | [`PromptKeyboard/`](./PromptKeyboard) | [`PromptKeyboard/README.md`](./PromptKeyboard/README.md) |
| ChatGPT App (MCP) | [`chatgpt-app/`](./chatgpt-app) | [`chatgpt-app/README.md`](./chatgpt-app/README.md) |
| Fastlane | [`fastlane/`](./fastlane) | [`fastlane/README.md`](./fastlane/README.md) |
| GPT Store assets | [`docs/`](./docs) | [`docs/gpt-store-setup.md`](./docs/gpt-store-setup.md) |

---

## Tech Stack

### Backend
- **Runtime:** Node.js 20 (ESM, NodeNext module resolution)
- **Language:** TypeScript 5.6 (strict, `noUncheckedIndexedAccess`)
- **Framework:** Express 4
- **Database:** PostgreSQL 16 via Prisma 5
- **Cache / Queues:** Redis 5, BullMQ 5
- **Realtime:** Socket.IO 4
- **Auth:** Apple Sign-In, Google OAuth, JWT (access 15 min / refresh 7 d)
- **Payments:** Apple StoreKit 2 (iOS), Stripe (web + enterprise API)
- **Observability:** Pino (structured JSON), Sentry (optional), health probes
- **AI Providers:** DeepSeek (primary), Anthropic, OpenAI, Google Gemini
- **Email:** Resend
- **Validation:** Zod at every route boundary

### Web
- **Framework:** Next.js 14 (App Router, route groups, RSC)
- **UI:** TailwindCSS 3, Framer Motion, lucide-react
- **State:** Zustand (client) + TanStack React Query (server) + `jose` (JWT)
- **PWA:** `next-pwa` with Workbox runtime caching
- **Payments:** Stripe Checkout & Customer Portal

### iOS
- **Language:** Swift 6 with strict concurrency
- **UI:** SwiftUI, WidgetKit, ActivityKit
- **Persistence:** SwiftData + shared Keychain (App Group `group.com.res.promptomizer`)
- **Networking:** `actor APIClient` with automatic JWT refresh
- **Subscriptions:** StoreKit 2
- **Telemetry:** Firebase Analytics + Crashlytics (no PII)
- **Privacy:** `PrivacyInfo.xcprivacy` declared per target

### Infrastructure
- **Backend:** Railway (Docker, auto-deploy from `main`)
- **Web:** Vercel (region `iad1`, auto-deploy from `main`)
- **iOS:** App Store Connect via Fastlane / GitHub Actions

---

## Development Workflow

| Task | Command |
|------|---------|
| Backend dev server | `cd backend && npm run dev` |
| Backend production build | `cd backend && npm run build && npm start` |
| Backend type-check | `cd backend && npm run typecheck` |
| Backend lint | `cd backend && npm run lint` |
| Backend format | `cd backend && npm run format` |
| Prisma generate | `cd backend && npm run db:generate` |
| Prisma migrate (dev) | `cd backend && npx prisma migrate dev --name <slug>` |
| Prisma migrate (prod) | `cd backend && npm run db:migrate` |
| Prisma Studio | `cd backend && npm run db:studio` |
| Web dev server | `cd web && npm run dev` |
| Web production build | `cd web && npm run build` |
| Web lint | `cd web && npm run lint` |
| Web format | `cd web && npm run format` |
| iOS build (sim) | `xcodebuild -scheme Prompt -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build` |
| iOS archive | `fastlane release` (see [`fastlane/Fastfile`](./fastlane/Fastfile)) |

### Branching & commits

- Default branch: `main` (production)
- Feature branches: `feat/<short-slug>` / `fix/<short-slug>` / `chore/<short-slug>`
- Use **Conventional Commits** for messages
  (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `build:`, `ci:`)
- Open a PR against `main`; CI must be green before merge
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full PR + review checklist

---

## Deployment

| Component | Platform | Trigger | Definition |
|-----------|----------|---------|------------|
| Backend | Railway (Docker) | `push` to `main` | [`backend/Dockerfile`](./backend/Dockerfile), [`backend/railway.json`](./backend/railway.json), [`.github/workflows/backend.yml`](./.github/workflows/backend.yml) |
| Web | Vercel | `push` to `main` | [`web/vercel.json`](./web/vercel.json), [`.github/workflows/web.yml`](./.github/workflows/web.yml) |
| iOS | App Store Connect | manual / tag | [`fastlane/Fastfile`](./fastlane/Fastfile), [`ExportOptions.plist`](./ExportOptions.plist), [`.github/workflows/ios.yml`](./.github/workflows/ios.yml) |
| ChatGPT App | Railway | manual | [`chatgpt-app/railway.json`](./chatgpt-app/railway.json) |

Production endpoints:

- API: `https://backend-production-d538.up.railway.app/api/v1`
- Web: `https://promptomize.app`
- iOS: [App Store listing](https://apps.apple.com/us/app/promptomize/id6758075605)
- ChatGPT App: `https://promptomize-chatgpt-app-production.up.railway.app`

---

## Quality, Security & Compliance

- **Static analysis:** [CodeQL](./.github/workflows/codeql.yml) runs on every PR for the JavaScript/TypeScript surface.
- **Dependency hygiene:** [Dependabot](./.github/dependabot.yml) opens weekly PRs for `npm`,
  `github-actions`, and `docker`.
- **Secrets:** Loaded exclusively from environment variables. Never commit `.env*` files
  (enforced via `.gitignore`). The full inventory lives in `.env.example` per package.
- **Webhook safety:** All Stripe and Apple App Store webhooks are deduplicated via the
  `WebhookIdempotencyKey` table with SHA-256 keys and a 24 h TTL.
- **Rate limiting:** Both global (Express) and per-tier (in-memory + Redis) limits are
  enforced before quota.
- **Privacy:** Apple Privacy Manifests (`PrivacyInfo.xcprivacy`) are declared for the iOS
  app, widget, and keyboard extensions. No PII is logged client- or server-side.
- **Vulnerability disclosure:** See [SECURITY.md](./SECURITY.md).
- **Code of conduct:** See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- **License:** Proprietary — see [LICENSE](./LICENSE).

---

## Project Conventions

The full set of rules lives in [`CLAUDE.md`](./CLAUDE.md). The highlights:

- **Backend imports use `.js` extensions** (NodeNext); env vars read via bracket notation.
- **Two subscription systems are kept strictly separate** (`Subscription` for app users via
  StoreKit 2 / Stripe, `ApiSubscription` for enterprise developers via Stripe).
- **Never `prisma db push` in production** — always migrate.
- **App Store metadata must not reference third-party AI brand names** (regional review
  has rejected for this); use generic terms ("AI models", "language models").
- **iOS extensions share auth state via the App Group `group.com.res.promptomizer`** — any
  change to token storage must be coordinated across the main app, widget, and keyboard.

---

## Support

- **Bug reports & feature requests:** open a GitHub Issue using the templates under
  [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE).
- **Security disclosures:** follow [SECURITY.md](./SECURITY.md). Do **not** open a public
  issue for a vulnerability.
- **Product support:** [support@promptomize.app](mailto:support@promptomize.app).

---

## License

This project is **proprietary, all rights reserved**. See [LICENSE](./LICENSE) for the full
text. Contributions submitted via Pull Request are governed by the
[Contributor License Agreement](./CONTRIBUTING.md#contributor-license-agreement) embedded in
`CONTRIBUTING.md`.
