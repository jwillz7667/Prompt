# Contributing to Promptomize

Thank you for considering a contribution. This document captures everything you need to
know — branching, coding standards, the review process, and the legal terms — to keep
the codebase healthy and shippable.

> **Audience:** Internal engineers, contractors, and pre-approved external collaborators.
> Public Pull Requests will only be reviewed if a Contributor License Agreement (see
> §10) is acknowledged in the PR body.

---

## Table of Contents

1. [Code of Conduct](#1-code-of-conduct)
2. [Environment Setup](#2-environment-setup)
3. [Branching Strategy](#3-branching-strategy)
4. [Commit Conventions](#4-commit-conventions)
5. [Coding Standards](#5-coding-standards)
6. [Testing Expectations](#6-testing-expectations)
7. [Pull Request Checklist](#7-pull-request-checklist)
8. [Code Review](#8-code-review)
9. [Release Process](#9-release-process)
10. [Contributor License Agreement](#10-contributor-license-agreement)

---

## 1. Code of Conduct

All contributors are expected to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md). In
short: be respectful, assume good intent, and focus on the work.

## 2. Environment Setup

Follow the [Quick Start](./README.md#quick-start) section of `README.md`. The minimum
toolchain is documented in [`.nvmrc`](./.nvmrc) and [`.editorconfig`](./.editorconfig).

If you use VS Code, install the recommended extensions surfaced when you open the
workspace; they cover ESLint, Prettier, EditorConfig, Tailwind, and Prisma.

## 3. Branching Strategy

- `main` is **always deployable**. Direct pushes are blocked; everything ships via PR.
- Feature branches: `feat/<short-slug>`
- Bug fixes: `fix/<short-slug>`
- Chores / refactors: `chore/<short-slug>`
- Releases: a `chore: release vX.Y.Z` commit on `main` plus a tag `vX.Y.Z`.

Hotfix branches go directly off `main` (`fix/<slug>`) and target `main`. There is no
long-lived `develop` branch.

## 4. Commit Conventions

We use [Conventional Commits 1.0.0](https://www.conventionalcommits.org). Examples:

```
feat(api): add /api/v1/threads/:id/share
fix(ios): refresh JWT before WidgetKit timeline reload
chore(deps): bump @anthropic-ai/sdk to 0.79
docs(readme): document local Postgres setup
refactor(web): extract pricing card into shared component
perf(backend): cache modality builders in promptEnhancementEngine
test(api): add happy-path coverage for /prompts/enhance
build(ci): pin actions/checkout to v4
```

Subject line ≤ 72 chars. Body wraps at 100 chars. Use the imperative mood. If the change
is breaking, append `BREAKING CHANGE:` in the footer with a migration note.

## 5. Coding Standards

The full set of rules lives in [`CLAUDE.md`](./CLAUDE.md). Highlights below.

### General

- **Production-grade only.** No stubs, no `TODO` placeholders, no commented-out code.
- **Match existing patterns.** Read neighbouring files before introducing new abstractions.
- **Comments explain *why*, not *what*.** Self-documenting code first; comments only when
  the rationale is non-obvious.
- **Trust the type system.** Add validation only at trust boundaries (HTTP requests,
  third-party APIs, user input).

### Backend (TypeScript)

- ESM modules — every relative import **must** include the `.js` extension.
- `process.env['VAR_NAME']` (bracket notation) — `noUncheckedIndexedAccess` is on.
- Validate every request with [Zod](https://zod.dev) at the route boundary.
- Routes are thin: parse → call service → return DTO. Business logic lives in `services/`.
- Use the named Pino loggers (`logger`, `promptLogger`, `subscriptionLogger`,
  `webhookLogger`). Never `console.log`.
- Never conflate `Subscription` (app users) and `ApiSubscription` (developers). They are
  different tables, routes, and middleware.
- Webhook handlers are idempotent via the `WebhookIdempotencyKey` table.

### Web (TypeScript / React)

- Functional components with hooks. No class components.
- Server state in TanStack React Query; client state in Zustand. **Never** mix the two.
- Strict TypeScript — no `any`, no escape-hatch `as` casts.
- Tailwind classes follow the order enforced by `prettier-plugin-tailwindcss`.
- Use Next.js `Image` and `Link` instead of raw `<img>` and `<a>` for internal links.

### iOS (Swift 6)

- Modern concurrency: `async/await`, structured concurrency, `@MainActor` for UI types.
- Prefer value types (`struct`, `enum`). Use classes only when reference semantics matter.
- `guard let` for early returns; `if let` for in-line optional binding.
- Booleans named as questions: `isLoading`, `hasCompleted`, `shouldRetry`.
- Errors are enums conforming to `LocalizedError`.
- Networking goes through `actor APIClient`. Never instantiate a one-off `URLSession`.
- Auth state shared via `SharedKeychainHelper` + App Group `group.com.res.promptomizer`.

### Database (Prisma)

- Generate migrations locally with `npx prisma migrate dev --name <slug>`.
- Never run `prisma db push` against a non-local database.
- Add explicit indexes on every foreign key used in a hot read path.
- Prefer enums over free-form strings for finite domains.

## 6. Testing Expectations

The repository does not yet ship a unit-test framework on every layer. Until it does,
contributors are expected to:

- **Backend:** verify changes with `npm run typecheck` and `npm run lint`. Exercise new
  endpoints manually with `curl` / Insomnia / Postman — include the request and response
  in the PR description for non-trivial routes.
- **Web:** run `npm run lint` and `npm run build`. For UI changes, attach before/after
  screenshots and a short Loom or screen recording.
- **iOS:** build for iPhone 16 Pro simulator. For UI changes, capture screenshots via the
  Fastlane snapshot lane or attach manually.

When a unit-test framework lands, the PR checklist below will require accompanying tests.

## 7. Pull Request Checklist

Use the [PR template](./.github/PULL_REQUEST_TEMPLATE.md). Before requesting review, confirm:

- [ ] Branch is rebased on the latest `main`.
- [ ] Commits follow Conventional Commits and tell a clean story (squash WIP commits).
- [ ] CI is green (lint, typecheck, build for the relevant package).
- [ ] You ran the affected layer locally end-to-end.
- [ ] No secrets, API keys, or `.env*` files are committed.
- [ ] Public API or schema changes are documented (`docs/`, `CHANGELOG.md`).
- [ ] User-visible changes include screenshots or a short recording.
- [ ] Breaking changes are flagged in the PR title (`feat!:` / `fix!:`) and body.

## 8. Code Review

- Reviewers prioritise **correctness, security, and consistency** with existing patterns.
- Reviewers should leave **specific, actionable** comments; authors should respond to or
  resolve every comment before re-requesting review.
- A PR is merge-eligible when:
  - At least one approving review from a CODEOWNER for the touched area.
  - All required CI checks are green.
  - All conversations are resolved.
- Use **Squash & Merge** on the merge button so `main` keeps a tidy linear history.

## 9. Release Process

Web and Backend deploy automatically on push to `main` (see [README §Deployment](./README.md#deployment)).
iOS releases follow this sequence:

1. Bump `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `Prompt.xcodeproj`.
2. Update [`CHANGELOG.md`](./CHANGELOG.md) under a new `## [X.Y.Z]` heading.
3. Open a `chore: release vX.Y.Z` PR; once merged, tag `vX.Y.Z` on `main`.
4. Run `fastlane release` (or trigger the iOS workflow with the release label).
5. Submit for App Review with the release notes pulled from `CHANGELOG.md`.

## 10. Contributor License Agreement

By submitting a Pull Request you certify that:

1. You have the legal right to submit the contribution and to license it under the terms
   of this repository's [LICENSE](./LICENSE).
2. You grant the Author a perpetual, worldwide, royalty-free, irrevocable license to use,
   reproduce, modify, distribute, sublicense, and otherwise exploit the contribution as
   part of the Materials.
3. The contribution is your original work, or you have clearly indicated the portions
   that are not and cited their licenses.

External contributors must include the following sentence in the PR body:

> I acknowledge and agree to the Contributor License Agreement in CONTRIBUTING.md §10.

PRs without this acknowledgement will not be merged.
