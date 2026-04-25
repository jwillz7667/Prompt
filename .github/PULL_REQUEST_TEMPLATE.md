<!--
Thanks for opening a PR! Please complete the sections below so reviewers can move quickly.
External contributors must include the CLA acknowledgement at the bottom of this template.
-->

## Summary

<!-- One or two sentences describing what this PR does and why it exists. -->

## Type of change

<!-- Check all that apply -->

- [ ] feat — new user-visible feature
- [ ] fix — bug fix
- [ ] perf — performance improvement
- [ ] refactor — non-functional code change
- [ ] docs — documentation only
- [ ] chore — tooling, deps, CI
- [ ] test — adds or updates tests
- [ ] build / ci — build system or CI changes
- [ ] BREAKING CHANGE — incompatible API or behavior change

## Affected components

- [ ] `backend/`
- [ ] `web/`
- [ ] `Prompt/` (iOS app)
- [ ] `PromptWidgetExtension/`
- [ ] `PromptKeyboard/`
- [ ] `chatgpt-app/`
- [ ] `fastlane/` / iOS CI
- [ ] Repository tooling / docs

## Linked issue(s)

<!-- e.g. Closes #123, Refs #456 -->

## How was this tested?

<!-- Describe verification: commands run, screenshots/recordings, manual flows. -->

- [ ] `npm run lint` (where applicable)
- [ ] `npm run typecheck` (where applicable)
- [ ] `npm run build` (where applicable)
- [ ] iOS build succeeds for `iPhone 16 Pro` simulator (where applicable)
- [ ] Manual smoke test of the affected user flow

## Screenshots / recordings

<!-- Required for any UI change. Drag-and-drop into the editor or paste links. -->

## Database changes

- [ ] No schema changes
- [ ] Adds a Prisma migration generated with `npx prisma migrate dev --name <slug>`
- [ ] Backfill / data migration plan documented below (if needed)

## Deployment / rollout notes

<!-- Feature flags, env var additions, sequencing constraints, etc. -->

## Checklist

- [ ] Branch is rebased on the latest `main`
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
- [ ] No secrets, API keys, or `.env*` files are committed
- [ ] User-facing changes documented in [`CHANGELOG.md`](../CHANGELOG.md) under
      `## [Unreleased]`
- [ ] Public API or schema changes documented in [`docs/`](../docs)
- [ ] All conversations from prior reviews are resolved

## Contributor License Agreement

<!--
External contributors must keep the line below. Internal contributors may delete it.
-->

> I acknowledge and agree to the Contributor License Agreement in CONTRIBUTING.md §10.
