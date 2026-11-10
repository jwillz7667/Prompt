import Stripe from 'stripe'
import type { NextRequest } from 'next/server'

export const backendURL =
  process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d7487.up.railway.app/api/v1'

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Billing is not configured')
  return new Stripe(key, { timeout: 15_000, maxNetworkRetries: 1 })
}

export function appOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('The application URL is not configured')
  }
  return new URL(configured || request.nextUrl.origin).origin
}

export function tierForPrice(priceId: string): 'PRO' | 'PREMIUM' | null {
  if (
    [
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_ANNUAL,
    ].includes(priceId)
  )
    return 'PREMIUM'
  if (
    [
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL,
    ].includes(priceId)
  )
    return 'PRO'
  return null
}

export function stripeID(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id || null
}

export function subscriptionPeriodEnd(subscription: Stripe.Subscription): number {
  const item = subscription.items.data.find((item) => tierForPrice(item.price.id))
  // Signed events from older destinations may still contain the Acacia shape.
  const legacy = subscription as Stripe.Subscription & { current_period_end?: number }
  const end = item?.current_period_end ?? legacy.current_period_end
  if (!end || !Number.isFinite(end)) throw new Error('Subscription billing period is missing')
  return end
}

export function invoiceSubscriptionID(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null }
  return stripeID(invoice.parent?.subscription_details?.subscription ?? legacy.subscription)
}

export async function fetchAccount(path: string, accessToken: string): Promise<Response> {
  return fetch(`${backendURL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
}
