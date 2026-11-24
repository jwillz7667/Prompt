import { loadCheckoutConfig, loadWebhookConfig } from '@/lib/stripe/config'

// Boot-time report, loud but not fatal: without Stripe the site still serves
// everything else and checkout answers 503 BILLING_NOT_CONFIGURED.
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const checkout = loadCheckoutConfig()
  if (!checkout.isConfigured) {
    console.warn(
      `BOOT: web checkout disabled; missing or invalid env: ${checkout.missing.join(', ')}`,
    )
    return
  }
  const webhook = loadWebhookConfig()
  if (!webhook.isConfigured) {
    console.error(
      `BOOT: Stripe webhook relay disabled; subscriptions will not activate. Missing or invalid env: ${webhook.missing.join(', ')}`,
    )
  }
}
