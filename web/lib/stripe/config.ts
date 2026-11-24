import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)

const checkoutEnvSchema = z.object({
  STRIPE_SECRET_KEY: nonEmpty.regex(/^(sk|rk)_(live|test)_/, 'must be a Stripe secret key'),
  STRIPE_PREMIUM_MONTHLY_PRICE_ID: nonEmpty.regex(/^price_/, 'must be a Stripe price ID'),
})

const webhookEnvSchema = checkoutEnvSchema.extend({
  STRIPE_WEBHOOK_SECRET: nonEmpty.regex(/^whsec_/, 'must be a Stripe webhook signing secret'),
  BACKEND_WEBHOOK_SECRET: nonEmpty,
})

// Price IDs of retired consumer plans (Pro, annual, the old Premium price).
// They are no longer sold, but subscribers on them stay Premium until they
// lapse, so their webhooks must still be recognized. The NEXT_PUBLIC_* names
// are what those prices were configured under before the single-plan change.
const LEGACY_PRICE_ENV_NAMES = [
  'NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_ANNUAL',
] as const

export type BillingEnv = Record<string, string | undefined>

export interface CheckoutConfig {
  secretKey: string
  premiumMonthlyPriceId: string
}

export interface WebhookConfig extends CheckoutConfig {
  webhookSecret: string
  relaySecret: string
  consumerPriceIds: ReadonlySet<string>
}

export type ConfigResult<T> =
  | { isConfigured: true; config: T }
  | { isConfigured: false; missing: string[] }

function invalidKeys(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => String(issue.path[0])))]
}

export function loadCheckoutConfig(env: BillingEnv = process.env): ConfigResult<CheckoutConfig> {
  const parsed = checkoutEnvSchema.safeParse(env)
  if (!parsed.success) return { isConfigured: false, missing: invalidKeys(parsed.error) }
  return {
    isConfigured: true,
    config: {
      secretKey: parsed.data.STRIPE_SECRET_KEY,
      premiumMonthlyPriceId: parsed.data.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
    },
  }
}

export function loadWebhookConfig(env: BillingEnv = process.env): ConfigResult<WebhookConfig> {
  const parsed = webhookEnvSchema.safeParse(env)
  if (!parsed.success) return { isConfigured: false, missing: invalidKeys(parsed.error) }
  const legacy = [
    ...(env.STRIPE_LEGACY_CONSUMER_PRICE_IDS ?? '').split(','),
    ...LEGACY_PRICE_ENV_NAMES.map((name) => env[name] ?? ''),
  ]
    .map((value) => value.trim())
    .filter((value) => value.startsWith('price_'))
  return {
    isConfigured: true,
    config: {
      secretKey: parsed.data.STRIPE_SECRET_KEY,
      premiumMonthlyPriceId: parsed.data.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
      webhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
      relaySecret: parsed.data.BACKEND_WEBHOOK_SECRET,
      consumerPriceIds: new Set([parsed.data.STRIPE_PREMIUM_MONTHLY_PRICE_ID, ...legacy]),
    },
  }
}
