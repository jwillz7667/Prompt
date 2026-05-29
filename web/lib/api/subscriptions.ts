import { api, getAccessToken } from './client'
import type {
  SubscriptionStatusResponse,
  TrialEligibilityResponse,
  StartTrialResponse,
  StripeCheckoutRequest,
  StripeCheckoutResponse,
  StripePortalResponse,
} from '@/lib/types/api'
import type { StripeProduct } from '@/lib/types/models'

export async function getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  return api.get<SubscriptionStatusResponse>('/subscriptions/status')
}

export async function getTrialEligibility(): Promise<TrialEligibilityResponse> {
  return api.get<TrialEligibilityResponse>('/subscriptions/trial/eligibility')
}

export async function startFreeTrial(): Promise<StartTrialResponse> {
  return api.post<StartTrialResponse>('/subscriptions/trial')
}

export async function getProducts(): Promise<{ products: StripeProduct[] }> {
  return api.get<{ products: StripeProduct[] }>('/subscriptions/products')
}

// Stripe-specific endpoints (called via Next.js API routes)
export async function createStripeCheckout(
  request: StripeCheckoutRequest
): Promise<StripeCheckoutResponse> {
  const token = getAccessToken()
  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    throw error
  }

  return response.json()
}

export async function createStripePortalSession(): Promise<StripePortalResponse> {
  const token = getAccessToken()
  const response = await fetch('/api/stripe/portal', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    throw error
  }

  return response.json()
}
