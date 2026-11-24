# 0002. The developer API requires a paid plan for every model request

- Status: accepted
- Date: 2026-11-24
- Supersedes: [0001](0001-developer-api-free-tier.md)

## Context

ADR 0001 kept a small free allowance (`API_FREE_MONTHLY_REQUESTS`, 25 a
month) on the developer API while the consumer app moved to a hard paywall.
Any verified email was still worth free model output, account farming across
networks was only slowed by a per-IP signup throttle, and the allowance was
a route around the app's single Premium entitlement.

## Decision

The developer API has no free model requests.

- `API_FREE` includes 0 requests, and `API_FREE_MONTHLY_REQUESTS` is removed.
  The free tier keeps an account, API keys, docs and the non-AI endpoints
  (`/usage`, `/models`, `/history`, `/recent`).
- `POST /api/v1/public/enhance` runs `enforceApiQuota`, which answers
  `402 {error, code:'API_PLAN_REQUIRED', message, upgradeUrl:'/developers/billing'}`
  unless the developer is on an ACTIVE `API_STARTER`, `API_PRO` or
  `API_ENTERPRISE` plan. `PAST_DUE`, `CANCELED` and `SUSPENDED` paid plans
  also get 402. The check runs before any stream opens.
- Credit packs only top up an active paid plan; a free account gets 402.
- Migration `20261124063000_api_free_tier_paid_only` strips the legacy
  allowance from existing `API_FREE` rows and keeps unspent purchased
  credits; `20261124070000_api_subscription_no_default_allowance` makes the
  column default 0.
- `DEVELOPER_SIGNUPS_PER_IP_PER_HOUR` (default 5) still throttles signups.

## Consequences

- No account can reach a model through the developer API without paying.
- Developers who were relying on the free allowance must choose a plan; the
  portal and `/docs` say so up front.
- The ChatGPT app (`chatgpt-app`) calls the API with one operator-owned key
  (`PROMPTOMIZE_CHATGPT_API_KEY`). That key's developer account must stay on
  an active paid plan, or the app reports the service as temporarily
  unavailable. Its users are served on the operator's plan.
