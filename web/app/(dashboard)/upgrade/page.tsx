'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingState } from '@/components/shared/loading-state'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useAuthStore } from '@/lib/stores/authStore'
import {
  createStripeCheckout,
  createStripePortalSession,
  getBillingConfig,
} from '@/lib/api/subscriptions'
import {
  APP_STORE_MANAGE_INSTRUCTIONS,
  PREMIUM_PLAN,
  PREMIUM_TRIAL_SUMMARY,
  premiumRenewalTerms,
} from '@/lib/billing/premium-plan'
import { classifyCheckoutFailure, resolveUpgradeView } from '@/lib/billing/upgrade-view'
import { toast } from '@/lib/stores/uiStore'
import { Check, Crown, ExternalLink, Smartphone } from 'lucide-react'

function formatDate(value: string | null): string | null {
  return value ? new Date(value).toLocaleDateString() : null
}

export default function UpgradePage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore()
  const { subscription, billingProvider, isEntitled, trialEligible, hasLoaded, error, refetch } =
    useSubscription()
  const [isCheckoutAvailable, setIsCheckoutAvailable] = useState<boolean | null>(null)
  const [pendingAction, setPendingAction] = useState<'checkout' | 'manage' | null>(null)

  useEffect(() => {
    let isCurrent = true
    getBillingConfig()
      .then((config) => isCurrent && setIsCheckoutAvailable(config.isCheckoutAvailable))
      // The checkout call reports BILLING_NOT_CONFIGURED itself; an unreachable
      // config route should not hide the offer.
      .catch(() => isCurrent && setIsCheckoutAvailable(true))
    return () => {
      isCurrent = false
    }
  }, [])

  const view = resolveUpgradeView({
    isAuthenticated,
    isAuthLoading,
    hasLoadedSubscription: hasLoaded,
    subscriptionError: error,
    isEntitled,
    isTrialing: subscription.isTrialing,
    billingProvider: billingProvider ?? null,
    trialEligible,
    isCheckoutAvailable,
  })

  const handleFailure = useCallback(
    async (failure: unknown) => {
      const outcome = classifyCheckoutFailure(failure)
      switch (outcome.kind) {
        case 'unavailable':
          setIsCheckoutAvailable(false)
          break
        case 'already_subscribed':
          toast.info('You already have Premium', 'Loading your subscription details.')
          await refetch()
          break
        case 'sign_in':
          toast.error('Please sign in again')
          break
        case 'message':
          toast.error(outcome.message)
          break
      }
    },
    [refetch],
  )

  const handleSubscribe = useCallback(async () => {
    setPendingAction('checkout')
    try {
      const { url } = await createStripeCheckout()
      window.location.href = url
    } catch (failure) {
      await handleFailure(failure)
      setPendingAction(null)
    }
  }, [handleFailure])

  const handleManage = useCallback(async () => {
    setPendingAction('manage')
    try {
      const portal = await createStripePortalSession()
      if (portal.provider === 'appstore') {
        toast.info('Managed by the App Store', portal.instructions)
        setPendingAction(null)
        return
      }
      window.location.href = portal.url
    } catch (failure) {
      await handleFailure(failure)
      setPendingAction(null)
    }
  }, [handleFailure])

  if (view.kind === 'loading') return <LoadingState message="Loading your plan..." />

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">{PREMIUM_PLAN.name}</h1>
        <p className="mx-auto mt-2 max-w-xl text-[var(--text-secondary)]">
          One plan with everything: the prompt optimizer and the AI chat assistant, on the web and
          in the iOS app.
        </p>
      </div>

      {view.kind === 'signed_out' && (
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-[var(--text-primary)]">Sign in to start your free trial.</p>
            <Link href="/login">
              <Button variant="cyan">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {view.kind === 'status_error' && (
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-[var(--text-primary)]">We couldn&apos;t load your subscription.</p>
            <p className="text-sm text-[var(--text-secondary)]">{view.message}</p>
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {view.kind === 'subscribed' && (
        <Card className="border-brand-indigo/20">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <Badge variant="premium" className="px-3 py-1 text-sm">
                Premium
              </Badge>
              <p className="font-medium text-[var(--text-primary)]">
                {view.isTrialing ? "You're on your free trial" : "You're subscribed"}
              </p>
            </div>
            {subscription.expiresAt && (
              <p className="text-sm text-[var(--text-secondary)]">
                {view.isTrialing
                  ? `Trial ends on ${formatDate(subscription.trialEndsAt ?? subscription.expiresAt)}`
                  : subscription.autoRenewEnabled
                    ? `Renews on ${formatDate(subscription.expiresAt)}`
                    : `Access ends on ${formatDate(subscription.expiresAt)}`}
              </p>
            )}
            {view.manageWith === 'stripe' && (
              <Button
                variant="secondary"
                onClick={handleManage}
                isLoading={pendingAction === 'manage'}
                disabled={pendingAction !== null}
                rightIcon={<ExternalLink className="h-4 w-4" />}
              >
                Manage subscription
              </Button>
            )}
            {view.manageWith === 'appstore' && (
              <div className="flex items-start gap-3 rounded-xl bg-[var(--bg-secondary)] p-4">
                <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--text-secondary)]" />
                <p className="text-sm text-[var(--text-secondary)]">
                  {APP_STORE_MANAGE_INSTRUCTIONS}
                </p>
              </div>
            )}
            {view.manageWith === 'none' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Questions about your access?{' '}
                <Link href="/support" className="underline">
                  Contact support
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {view.kind === 'unavailable' && (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="font-medium text-[var(--text-primary)]">
              Web subscriptions aren&apos;t available right now
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              You can start your {PREMIUM_PLAN.trialDays}-day free trial in the Promptomize iOS app,
              then sign in here with the same account. Please check back later to subscribe on the
              web.
            </p>
          </CardContent>
        </Card>
      )}

      {view.kind === 'offer' && (
        <Card className="relative overflow-hidden border-brand-indigo ring-2 ring-brand-indigo/20">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-indigo text-white dark:bg-brand-cyan dark:text-black">
                <Crown className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{PREMIUM_PLAN.name}</h2>
            </div>

            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-bold text-[var(--text-primary)]">
                  {PREMIUM_PLAN.priceLabel}
                </span>
                <span className="text-lg text-[var(--text-secondary)]">
                  /{PREMIUM_PLAN.intervalLabel}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
                {view.includesTrial
                  ? PREMIUM_TRIAL_SUMMARY
                  : `${PREMIUM_PLAN.priceLabel}/${PREMIUM_PLAN.intervalLabel}, cancel anytime`}
              </p>
            </div>

            <ul className="space-y-3">
              {PREMIUM_PLAN.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-500">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </div>
                  <span className="text-sm text-[var(--text-primary)]">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="cyan"
              size="lg"
              className="w-full"
              onClick={handleSubscribe}
              isLoading={pendingAction === 'checkout'}
              disabled={pendingAction !== null}
            >
              {view.includesTrial
                ? `Start ${PREMIUM_PLAN.trialDays}-day free trial`
                : `Subscribe for ${PREMIUM_PLAN.priceLabel}/${PREMIUM_PLAN.intervalLabel}`}
            </Button>

            <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
              {premiumRenewalTerms(view.includesTrial)} Payments are processed securely by Stripe.
              By subscribing you agree to the{' '}
              <Link href="/terms" className="underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {view.kind !== 'subscribed' && (
        <p className="text-center text-xs text-[var(--text-tertiary)]">
          Already subscribed in the iOS app? Sign in here with the same account and Premium unlocks
          automatically.
        </p>
      )}
    </div>
  )
}
