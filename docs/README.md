# `docs/` — Long-form documentation

This folder is the home for narrative documentation that lives outside the per-package
READMEs. For repository-wide context, start at [`../README.md`](../README.md), then
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## What's here

| File | Purpose |
|------|---------|
| [`gpt-actions.yaml`](./gpt-actions.yaml) | OpenAPI spec for the GPT Actions integration (used by GPT Store listings) |
| [`gpt-store-setup.md`](./gpt-store-setup.md) | Step-by-step playbook for publishing a custom GPT that consumes the Promptomize API |

---

## What goes here vs. elsewhere

| Topic | Lives in |
|-------|----------|
| Architecture, data flows, decision log | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Repository quick start | [`../README.md`](../README.md) |
| Backend / Web / iOS specifics | [`../backend/README.md`](../backend/README.md), [`../web/README.md`](../web/README.md), [`../Prompt/README.md`](../Prompt/README.md) |
| Coding standards | [`../CLAUDE.md`](../CLAUDE.md), [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Security policy | [`../SECURITY.md`](../SECURITY.md) |
| Release notes | [`../CHANGELOG.md`](../CHANGELOG.md) |
| Long-form integration guides, RFCs, runbooks | **Here**, as new `*.md` files |

---

## Conventions for new docs

- Filename: lowercase-kebab-case (`integration-foo.md`, `runbook-on-call.md`).
- First heading: the document title.
- Include a top-of-file metadata block when the doc has a stable owner or expires:

  ```markdown
  > **Owner:** @jwillz7667 · **Last reviewed:** 2026-04-25 · **Next review:** 2026-10-25
  ```

- Wrap prose at 100 columns (matches `.editorconfig` / `.prettierrc`).
- Cross-link aggressively — every `../path` reference helps future readers.
- Prefer Mermaid or ASCII diagrams over images so diffs stay reviewable.
