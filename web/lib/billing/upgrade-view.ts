import { isSubscriptionRequired } from '@/lib/api/client'

export type BillingProvider = 'stripe' | 'appstore' | null

export interface UpgradeViewInput {
  isAuthenticated: boolean
  isAuthLoading: boolean
  hasLoadedSubscription: boolean
  subscriptionError: string | null
  isEntitled: boolean
  isTrialing: boolean
  billingProvider: BillingProvider
  trialEligible: boolean
  // null until GET /api/stripe/config answers.
  isCheckoutAvailable: boolean | null
}

export type UpgradeView =
  | { kind: 'loading' }
  | { kind: 'signed_out' }
  | { kind: 'status_error'; message: string }
  | {
      kind: 'subscribed'
      // Where the subscription is managed. 'none' covers grants with no store
      // agreement (for example legacy complimentary access).
      manageWith: 'stripe' | 'appstore' | 'none'
      isTrialing: boolean
    }
  | { kind: 'unavailable' }
  | { kind: 'offer'; includesTrial: boolean }

export function resolveUpgradeView(input: UpgradeViewInput): UpgradeView {
  if (input.isAuthLoading) return { kind: 'loading' }
  if (!input.isAuthenticated) return { kind: 'signed_out' }
  if (!input.hasLoadedSubscription) {
    return input.subscriptionError
      ? { kind: 'status_error', message: input.subscriptionError }
      : { kind: 'loading' }
  }
  if (input.isEntitled) {
    return {
      kind: 'subscribed',
      manageWith: input.billingProvider ?? 'none',
      isTrialing: input.isTrialing,
    }
  }
  if (input.isCheckoutAvailable === null) return { kind: 'loading' }
  if (!input.isCheckoutAvailable) return { kind: 'unavailable' }
  return { kind: 'offer', includesTrial: input.trialEligible }
}

export type CheckoutFailure =
  | { kind: 'unavailable' }
  | { kind: 'already_subscribed' }
  | { kind: 'sign_in' }
  | { kind: 'message'; message: string }

const GENERIC_CHECKOUT_FAILURE = 'Unable to start checkout. Please try again shortly.'

/** Maps a rejected checkout or portal call to what the upgrade page should do. */
export function classifyCheckoutFailure(error: unknown): CheckoutFailure {
  if (isSubscriptionRequired(error)) return { kind: 'message', message: error.message }
  if (typeof error !== 'object' || error === null) {
    return { kind: 'message', message: GENERIC_CHECKOUT_FAILURE }
  }
  const code = 'code' in error ? error.code : undefined
  const statusCode = 'statusCode' in error ? error.statusCode : undefined
  if (code === 'BILLING_NOT_CONFIGURED') return { kind: 'unavailable' }
  if (code === 'ALREADY_SUBSCRIBED') return { kind: 'already_subscribed' }
  if (statusCode === 401 || code === 'UNAUTHENTICATED') return { kind: 'sign_in' }
  if ('error' in error && typeof error.error === 'string' && error.error.length > 0) {
    return { kind: 'message', message: error.error }
  }
  if (error instanceof Error && error.message) return { kind: 'message', message: error.message }
  return { kind: 'message', message: GENERIC_CHECKOUT_FAILURE }
}
