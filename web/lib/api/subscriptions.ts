import { api } from './client'
import type {
  BillingConfigResponse,
  SubscriptionStatusResponse,
  StripeCheckoutResponse,
  StripePortalResponse,
} from '@/lib/types/api'

export async function getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  return api.get<SubscriptionStatusResponse>('/subscriptions/status')
}

// Stripe-specific endpoints (called via Next.js API routes)
export async function getBillingConfig(): Promise<BillingConfigResponse> {
  return api.get<BillingConfigResponse>('/api/stripe/config', { local: true, skipAuth: true })
}

/** Starts Premium checkout. The server picks the price and whether a trial applies. */
export async function createStripeCheckout(): Promise<StripeCheckoutResponse> {
  return api.post<StripeCheckoutResponse>(
    '/api/stripe/checkout',
    { plan: 'premium_monthly' },
    { local: true },
  )
}

export async function createStripePortalSession(): Promise<StripePortalResponse> {
  return api.post<StripePortalResponse>('/api/stripe/portal', undefined, { local: true })
}
