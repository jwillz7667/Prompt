import { describe, expect, it } from 'vitest'
import {
  classifyCheckoutFailure,
  resolveUpgradeView,
  type UpgradeViewInput,
} from '@/lib/billing/upgrade-view'
import { SubscriptionRequiredError } from '@/lib/api/client'

const base: UpgradeViewInput = {
  isAuthenticated: true,
  isAuthLoading: false,
  hasLoadedSubscription: true,
  subscriptionError: null,
  isEntitled: false,
  isTrialing: false,
  billingProvider: null,
  trialEligible: true,
  isCheckoutAvailable: true,
}

describe('resolveUpgradeView', () => {
  it('asks a signed-out visitor to sign in', () => {
    expect(resolveUpgradeView({ ...base, isAuthenticated: false })).toEqual({
      kind: 'signed_out',
    })
  })

  it('waits for the subscription before offering checkout', () => {
    expect(resolveUpgradeView({ ...base, hasLoadedSubscription: false })).toEqual({
      kind: 'loading',
    })
  })

  it('shows the load error when the subscription never loaded', () => {
    expect(
      resolveUpgradeView({ ...base, hasLoadedSubscription: false, subscriptionError: 'offline' }),
    ).toEqual({ kind: 'status_error', message: 'offline' })
  })

  it('offers the trial to an eligible account', () => {
    expect(resolveUpgradeView(base)).toEqual({ kind: 'offer', includesTrial: true })
  })

  it('offers a paid subscription without a trial to a returning subscriber', () => {
    expect(resolveUpgradeView({ ...base, trialEligible: false })).toEqual({
      kind: 'offer',
      includesTrial: false,
    })
  })

  it('shows the unavailable message when web billing is not configured', () => {
    expect(resolveUpgradeView({ ...base, isCheckoutAvailable: false })).toEqual({
      kind: 'unavailable',
    })
  })

  it('shows Stripe management to a web subscriber', () => {
    expect(
      resolveUpgradeView({
        ...base,
        isEntitled: true,
        billingProvider: 'stripe',
        isTrialing: true,
      }),
    ).toEqual({ kind: 'subscribed', manageWith: 'stripe', isTrialing: true })
  })

  it('sends an App Store subscriber to Apple settings even when web billing is off', () => {
    expect(
      resolveUpgradeView({
        ...base,
        isEntitled: true,
        billingProvider: 'appstore',
        isCheckoutAvailable: false,
      }),
    ).toEqual({ kind: 'subscribed', manageWith: 'appstore', isTrialing: false })
  })

  it('treats entitlement without a store agreement as subscribed with nothing to manage', () => {
    expect(resolveUpgradeView({ ...base, isEntitled: true })).toMatchObject({
      kind: 'subscribed',
      manageWith: 'none',
    })
  })
})

describe('classifyCheckoutFailure', () => {
  it('maps BILLING_NOT_CONFIGURED to the unavailable state', () => {
    expect(
      classifyCheckoutFailure({ statusCode: 503, code: 'BILLING_NOT_CONFIGURED', error: 'x' }),
    ).toEqual({ kind: 'unavailable' })
  })

  it('maps ALREADY_SUBSCRIBED so the page reloads the subscription', () => {
    expect(
      classifyCheckoutFailure({ statusCode: 409, code: 'ALREADY_SUBSCRIBED', error: 'x' }),
    ).toEqual({ kind: 'already_subscribed' })
  })

  it('asks for sign-in on 401', () => {
    expect(classifyCheckoutFailure({ statusCode: 401, error: 'Unauthorized' })).toEqual({
      kind: 'sign_in',
    })
  })

  it('surfaces the server message for other failures', () => {
    expect(classifyCheckoutFailure({ statusCode: 503, error: 'Try again shortly.' })).toEqual({
      kind: 'message',
      message: 'Try again shortly.',
    })
  })

  it('surfaces the paywall message for a subscription-required error', () => {
    expect(classifyCheckoutFailure(new SubscriptionRequiredError())).toMatchObject({
      kind: 'message',
    })
  })
})
