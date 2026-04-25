# Promptomize Web

The Next.js 14 product surface — marketing site, authenticated dashboard, admin console,
and Enterprise developer portal — deployed to Vercel.

[![Web CI/CD](https://github.com/jwillz7667/Prompt/actions/workflows/web.yml/badge.svg)](../.github/workflows/web.yml)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](./package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-339933?logo=node.js&logoColor=white)](../.nvmrc)

> For repository-wide context, see [`../README.md`](../README.md).
> For architecture and data flows, see [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## Contents

1. [Stack](#stack)
2. [Project layout](#project-layout)
3. [Getting started](#getting-started)
4. [Environment variables](#environment-variables)
5. [Scripts](#scripts)
6. [Routing & route groups](#routing--route-groups)
7. [State management](#state-management)
8. [Authentication](#authentication)
9. [Payments](#payments)
10. [PWA](#pwa)
11. [Conventions](#conventions)
12. [Deployment](#deployment)

---

## Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 14 (App Router, RSC, route groups) |
| Language | TypeScript 5 (strict, `noImplicitAny`, no `any`/`as` casts) |
| UI | TailwindCSS 3 + Framer Motion + lucide-react |
| Server state | TanStack React Query 5 |
| Client state | Zustand 4 |
| JWT (client-side) | `jose` 5 |
| Payments | Stripe + `@stripe/stripe-js` |
| PWA | `next-pwa` (Workbox runtime caching) |
| Realtime | `socket.io-client` (support chat) |
| Validation | Zod (shared with backend) |

---

## Project layout

```
web/
├── app/
│   ├── (marketing)/             Public landing pages — no auth required
│   ├── (auth)/                  Apple / Google sign-in flow
│   ├── (dashboard)/             Authenticated user surface (history, templates, settings, …)
│   ├── admin/                   Internal admin console
│   ├── developers/
│   │   ├── (auth)/              Developer sign-in / register
│   │   └── (portal)/            API key management + usage dashboard
│   ├── docs/                    Public developer documentation
│   ├── api/                     Next.js API routes (Stripe checkout, OAuth callbacks, etc.)
│   ├── offline/                 PWA offline fallback page
│   ├── privacy/, terms/, support/   Legal & support pages
│   ├── layout.tsx               Root layout (providers, metadata, theme)
│   ├── page.tsx                 Marketing landing page
│   ├── manifest.json            PWA manifest
│   ├── sitemap.ts               Dynamic sitemap
│   ├── robots.ts                robots.txt
│   └── globals.css              Tailwind layers + design tokens
│
├── components/
│   ├── ui/                      Primitives (Button, Card, Dialog, Input, …)
│   ├── layout/                  Page-level layout (Header, Footer, Sidebar)
│   ├── shared/                  Cross-cutting widgets
│   ├── hero/                    Marketing hero composition
│   └── providers.tsx            Query client + theme + auth providers
│
├── lib/
│   ├── api/                     Typed client for the Express backend (auto refresh + SSE)
│   ├── hooks/                   React hooks (mostly React Query)
│   ├── stores/                  Zustand stores (client-only state)
│   ├── types/                   Shared TypeScript types
│   └── utils/                   cn(), formatters, helpers
│
├── public/                      Static assets (icons, OG images, generated SW)
├── middleware.ts                Edge middleware: apex redirect + auth gate for protected paths
├── next.config.js               Next + next-pwa + security headers + image config
├── tailwind.config.ts           Theme + content + plugin config
├── tsconfig.json                Strict TS with `@/*` path alias
└── vercel.json                  Region pinning + extra security headers
```

---

## Getting started

```bash
# From the repository root
nvm use                         # picks up ../.nvmrc → Node 20
cd web
cp .env.example .env.local      # fill in local-only values
npm ci
npm run dev                     # default port 3000

# If the backend is already on 3000, start the web app on 3001:
PORT=3001 npm run dev
```

The web app talks to the backend via `NEXT_PUBLIC_API_URL`. To point at a local backend
during development, set:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

---

## Environment variables

Full inventory in [`.env.example`](./.env.example). Required:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Express backend base URL (`/api/v1`) |
| `NEXT_PUBLIC_APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Apple Sign-In (web service ID) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe |
| `NEXT_PUBLIC_STRIPE_PRICE_*` | Stripe price IDs (Pro/Premium × monthly/annual) |
| `BACKEND_WEBHOOK_SECRET` | HMAC for Next.js → Express webhook forwarding |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | Cookie / session secret |

All `NEXT_PUBLIC_*` variables are inlined at build time and visible to the client.
Server-only secrets (without the `NEXT_PUBLIC_` prefix) stay on the server.

---

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Next dev server with Fast Refresh |
| `npm run build` | Production build (Next + next-pwa SW generation) |
| `npm start` | Run the built app (`next start`) |
| `npm run lint` / `npm run lint:fix` | ESLint via `next lint` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` / `npm run format:check` | Prettier (Tailwind class-sorting plugin) |
| `npm run clean` | Remove `.next/`, `out/`, `.turbo/` |

---

## Routing & route groups

The App Router uses route groups (`(folder)`) to share layouts without affecting URLs:

| Group | Layout responsibilities |
|-------|--------------------------|
| `(marketing)` | Public header, footer, marketing nav |
| `(auth)` | Centered minimal layout for sign-in screens |
| `(dashboard)` | Authenticated chrome — sidebar, profile menu, command palette |
| `developers/(auth)` | Developer sign-in / register surface |
| `developers/(portal)` | Authenticated developer dashboard |
| `admin/` | Internal admin chrome |
| `docs/` | Documentation layout |

`middleware.ts` enforces:

1. Redirect `www.promptomize.app → promptomize.app` (308).
2. Redirect unauthenticated users away from protected paths to `/login`.
3. Redirect already-signed-in users away from `/login` to `/dashboard`.

Authentication is finalized client-side using the access token in `sessionStorage`; the
edge middleware uses the `refreshToken` cookie as a fast-path signal only.

---

## State management

- **Server state** lives in TanStack React Query. Every backend resource has a hook in
  `lib/hooks/` that returns `{ data, isLoading, error, mutate, … }`.
- **Client state** lives in Zustand stores under `lib/stores/`. Use stores for things
  the server does not own (UI mode, drafts, selection state, etc.).
- **Never** sync server state into Zustand or read URL params from React Query — keep
  the boundaries clean.

---

## Authentication

- The web app uses the same backend `/api/v1/auth/*` endpoints as the iOS app.
- Access tokens are stored in `sessionStorage` (cleared on tab close).
- The refresh token is set as an `HttpOnly` cookie by the backend.
- `lib/api/client.ts` automatically refreshes a 401 once before bubbling the error.
- Apple Sign-In on the web uses a separate Apple **Service ID**
  (`com.res.promptomizer.web`) — not the iOS Bundle ID.

---

## Payments

- **App tier subscriptions** (FREE / PRO / PREMIUM): Stripe Checkout from the web
  product, StoreKit 2 from iOS. Both write back to the same `Subscription` model on
  the backend.
- **Enterprise API tiers** (API_FREE / API_STARTER / API_PRO / API_ENTERPRISE):
  Stripe-only, written to the separate `ApiSubscription` model.
- Stripe webhooks are received by the **backend** (not Next.js) for idempotency. The
  Next.js `/api/stripe/*` routes only initiate Checkout sessions.

---

## PWA

`next-pwa` generates a service worker at build time:

- Workbox runtime caching is configured in `next.config.js` (CacheFirst for fonts and
  immutable assets, StaleWhileRevalidate for CSS/JS, NetworkFirst for `/api/*`).
- Generated artifacts (`public/sw.js`, `workbox-*`, `worker-*`) are gitignored.
- The PWA is disabled in development to avoid stale cache pain.
- Offline fallback is the static page at `/offline`.

---

## Conventions

- **No `any`. No `as` casts** without an inline justification comment.
- Functional components only. Use hooks from `lib/hooks/`.
- Server state in React Query. Client state in Zustand. No `useState` for data the
  server owns.
- Tailwind class order is enforced by `prettier-plugin-tailwindcss`.
- Use `next/image` and `next/link` for internal images and links.
- Follow the API client in `lib/api/client.ts` for all backend calls — never `fetch()`
  directly from a component.

---

## Deployment

- Built and deployed automatically from `main` via
  [`.github/workflows/web.yml`](../.github/workflows/web.yml) → Vercel.
- Production region: `iad1`.
- Custom security headers configured in both
  [`vercel.json`](./vercel.json) and [`next.config.js`](./next.config.js).
- Production URL: <https://promptomize.app>.
