import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { loadCheckoutConfig } from '@/lib/stripe/config'
import {
  AccountLookupError,
  accountLookupResponse,
  appOrigin,
  bearerToken,
  billingError,
  consumerItem,
  fetchAccountUser,
  fetchBillingStatus,
  isEntitledAnywhere,
  notConfiguredResponse,
  stripeClient,
} from '@/lib/stripe/server'
import { PREMIUM_PLAN } from '@/lib/billing/premium-plan'

// The only plan sold. The price comes from env; any client-sent price, tier
// or interval is stripped by the schema and never reaches Stripe.
const checkoutSchema = z.object({ plan: z.literal(PREMIUM_PLAN.id).optional() })

// Subscription states that still bill, or will resume billing, the customer.
const LIVE_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
])
// Never-paid first attempts; they do not use up the free trial.
const ABANDONED_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  'incomplete',
  'incomplete_expired',
])

function shortIdentifier(seed: string): string {
  return [...createHash('sha256').update(seed).digest().subarray(0, 8)]
    .map((value) => String.fromCharCode(97 + (value % 26)))
    .join('')
}

const alreadySubscribed = (billingProvider: 'stripe' | 'appstore' | null) =>
  billingError(409, 'ALREADY_SUBSCRIBED', 'You already have Promptomize Premium.', {
    billingProvider,
  })

export async function POST(request: NextRequest) {
  const token = bearerToken(request)
  if (!token) return billingError(401, 'UNAUTHENTICATED', 'Please sign in to subscribe')

  const configResult = loadCheckoutConfig()
  if (!configResult.isConfigured) return notConfiguredResponse()
  const { secretKey, premiumMonthlyPriceId } = configResult.config

  const input = checkoutSchema.safeParse(await request.json().catch(() => ({})))
  if (!input.success) return billingError(400, 'INVALID_PLAN', 'This plan is not available.')

  try {
    const [user, status] = await Promise.all([fetchAccountUser(token), fetchBillingStatus(token)])
    // Includes App Store subscribers: a second, web subscription would bill them twice.
    if (isEntitledAnywhere(status)) return alreadySubscribed(status.billingProvider)

    const origin = appOrigin(request)
    const stripe = stripeClient(secretKey)

    let customerId = status.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email || undefined,
          name: user.name || undefined,
          metadata: { userId: user.id },
        },
        { idempotencyKey: `promptomize-customer-${user.id}` },
      )
      customerId = customer.id
    }

    // Stripe is checked directly as well: the webhook may not have landed yet,
    // and a deleted agreement is no longer recorded on the backend.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })
    const premiumPrice = new Set([premiumMonthlyPriceId])
    const consumerSubscriptions = subscriptions.data.filter(
      (subscription) =>
        subscription.metadata?.userId === user.id ||
        consumerItem(subscription, premiumPrice) !== undefined,
    )
    if (consumerSubscriptions.some((subscription) => LIVE_STATUSES.has(subscription.status))) {
      return alreadySubscribed('stripe')
    }
    const hasPriorSubscription = consumerSubscriptions.some(
      (subscription) =>
        !ABANDONED_STATUSES.has(subscription.status) || subscription.trial_start != null,
    )
    const includesTrial = status.trialEligible && !hasPriorSubscription
    const variant = `${premiumMonthlyPriceId}:${includesTrial ? 'trial' : 'paid'}`

    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 10 })
    const previous = sessions.data.find(
      (session) => session.mode === 'subscription' && session.metadata?.userId === user.id,
    )
    if (previous?.status === 'open' && previous.url) {
      if (previous.metadata?.variant === variant) {
        return NextResponse.json({ sessionId: previous.id, url: previous.url, includesTrial })
      }
      // The offer changed (price or trial). Invalidate the old payment link
      // first; if payment won the race, expiry fails and the customer retries
      // instead of paying twice.
      await stripe.checkout.sessions.expire(previous.id)
    }

    const intentKey = `promptomize-checkout-${customerId}-${previous?.id || 'initial'}-${variant}`
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: premiumMonthlyPriceId, quantity: 1 }],
        mode: 'subscription',
        payment_method_collection: 'always',
        success_url: `${origin}/dashboard?checkout=success`,
        cancel_url: `${origin}/upgrade?checkout=canceled`,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        integration_identifier: `promptomize_web_${shortIdentifier(intentKey)}`,
        metadata: { userId: user.id, variant },
        subscription_data: {
          metadata: { userId: user.id },
          ...(includesTrial ? { trial_period_days: PREMIUM_PLAN.trialDays } : {}),
        },
      },
      { idempotencyKey: intentKey },
    )
    if (!session.url) throw new Error('Checkout URL unavailable')
    return NextResponse.json({ sessionId: session.id, url: session.url, includesTrial })
  } catch (error) {
    if (error instanceof AccountLookupError) return accountLookupResponse(error)
    console.error('Stripe checkout failed', error)
    return billingError(
      503,
      'BILLING_UNAVAILABLE',
      'Unable to start checkout. Please try again shortly.',
    )
  }
}
