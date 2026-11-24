# 0001. The developer API free tier sits outside the app's hard paywall

- Status: superseded by [0002](0002-developer-api-paid-plans-only.md)
- Date: 2026-11-24

## Context

The iOS app moved to a hard paywall: every app route that can reach a model
runs `requireEntitlement`, and only an active App Store subscription
(`com.promptomizer.premium.monthly`) passes it.

The developer API (`/api/v1/public/*`, also used by the GPT Actions
integration) is a separate B2B product. Developers sign up with email and
password, verify the email, create an API key, and are billed through Stripe
on the `API_*` tiers (`ApiSubscription`, `apiStripeWebhook`). Every new
developer gets an `API_FREE` subscription with a monthly allowance of model
calls, and `requireEntitlement` never runs on these routes.

An audit flagged this as a way to get model output without an App Store
subscription. Each verified email was worth 100 free calls a month, and a
verified email was the only barrier to signing up.

## Decision

The developer API keeps its own billing and is an explicit exception to the
app paywall. Free access there is limited instead of removed:

- `API_FREE_MONTHLY_REQUESTS` (default **25**, previously a hard-coded 100) sets
  the free allowance. The tier description, the `/docs` quota table and the
  allowance given to new developers all read this one value.
- `DEVELOPER_SIGNUPS_PER_IP_PER_HOUR` (default **5**) throttles
  `POST /api/v1/developer/auth/signup` per client IP, which slows down
  account farming.
- The existing per-key `apiRateLimit` (10 requests per minute on the free
  tier) and `enforceApiQuota` are unchanged.

## Consequences

- An abuser gets at most 25 calls a month per verified email, and creating
  many accounts from one network is throttled. Spreading signups across many
  networks still works, so the allowance stays small on purpose.
- Developers who already have an `ApiSubscription` row keep the allowance
  recorded on it until their next plan change.
- Setting `API_FREE_MONTHLY_REQUESTS=0` turns the free tier into
  "paid plans only" without a deploy. Do this if abuse shows up in
  `ApiUsage`.
- The signup throttle keeps its counts in process memory, like the global
  API limiter, so it applies per instance. If the service scales out and
  abuse continues, move both limiters to a shared Redis store.
