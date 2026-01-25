'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { createStripeCheckout, createStripePortalSession } from '@/lib/api/subscriptions'
import { toast } from '@/lib/stores/uiStore'
import { cn } from '@/lib/utils/cn'
import {
  Crown,
  Check,
  Zap,
  Sparkles,
  Shield,
  Download,
  Layers,
  Rocket,
  ExternalLink,
} from 'lucide-react'

type BillingInterval = 'monthly' | 'annual'

interface PlanFeature {
  text: string
  included: boolean
  highlight?: boolean
}

interface Plan {
  id: string
  name: string
  tier: 'PRO' | 'PREMIUM'
  monthlyPrice: number
  annualPrice: number
  description: string
  features: PlanFeature[]
  popular?: boolean
  icon: React.ReactNode
}

const plans: Plan[] = [
  {
    id: 'pro',
    name: 'Pro',
    tier: 'PRO',
    monthlyPrice: 4.99,
    annualPrice: 49.99,
    description: 'Perfect for regular users',
    icon: <Zap className="h-6 w-6" />,
    features: [
      { text: '100 daily prompts', included: true, highlight: true },
      { text: 'Standard quality enhancements', included: true },
      { text: 'Up to 8K tokens per prompt', included: true },
      { text: 'Export to PDF/TXT/MD', included: true },
      { text: 'Priority support', included: true },
      { text: 'Batch processing', included: false },
      { text: 'Deep Think mode', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    tier: 'PREMIUM',
    monthlyPrice: 14.99,
    annualPrice: 149.99,
    description: 'For power users and teams',
    icon: <Crown className="h-6 w-6" />,
    popular: true,
    features: [
      { text: 'Unlimited daily prompts', included: true, highlight: true },
      { text: 'Advanced quality enhancements', included: true },
      { text: 'Up to 64K tokens per prompt', included: true },
      { text: 'Export to PDF/TXT/MD', included: true },
      { text: 'Priority support', included: true },
      { text: 'Batch processing', included: true, highlight: true },
      { text: 'Deep Think mode', included: true, highlight: true },
    ],
  },
]

// Stripe price IDs - replace with actual production IDs
const PRICE_IDS = {
  pro_monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly',
  pro_annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL || 'price_pro_annual',
  premium_monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY || 'price_premium_monthly',
  premium_annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_ANNUAL || 'price_premium_annual',
}

export default function UpgradePage() {
  const [interval, setInterval] = useState<BillingInterval>('annual')
  const [loading, setLoading] = useState<string | null>(null)

  const { subscription, trialEligible, startTrial, refreshAfterPurchase } = useSubscription()

  const currentTier = subscription.tier
  const isTrialing = subscription.isTrialing

  const handleStartTrial = useCallback(async () => {
    setLoading('trial')
    try {
      const success = await startTrial()
      if (success) {
        toast.success('Trial started!', 'Enjoy 7 days of Premium features')
      } else {
        toast.error('Failed to start trial')
      }
    } catch {
      toast.error('Failed to start trial')
    } finally {
      setLoading(null)
    }
  }, [startTrial])

  const handleSubscribe = useCallback(
    async (plan: Plan) => {
      setLoading(plan.id)
      try {
        const priceId =
          plan.tier === 'PRO'
            ? interval === 'monthly'
              ? PRICE_IDS.pro_monthly
              : PRICE_IDS.pro_annual
            : interval === 'monthly'
            ? PRICE_IDS.premium_monthly
            : PRICE_IDS.premium_annual

        const { url } = await createStripeCheckout({
          priceId,
          successUrl: `${window.location.origin}/dashboard?checkout=success`,
          cancelUrl: `${window.location.origin}/upgrade?checkout=canceled`,
        })

        window.location.href = url
      } catch (err) {
        toast.error('Failed to start checkout')
        setLoading(null)
      }
    },
    [interval]
  )

  const handleManageSubscription = useCallback(async () => {
    setLoading('manage')
    try {
      const { url } = await createStripePortalSession()
      window.location.href = url
    } catch {
      toast.error('Failed to open billing portal')
      setLoading(null)
    }
  }, [])

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
          Upgrade Your Experience
        </h1>
        <p className="mt-2 text-[var(--text-secondary)] max-w-xl mx-auto">
          Unlock the full potential of AI prompt enhancement with more prompts, better quality, and
          advanced features.
        </p>
      </div>

      {/* Trial banner */}
      {trialEligible && currentTier === 'FREE' && !isTrialing && (
        <Card className="bg-gradient-to-r from-brand-indigo/10 to-brand-cyan/10 border-brand-indigo/20">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-indigo/20">
                <Rocket className="h-6 w-6 text-brand-indigo" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Try Premium Free for 7 Days
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  No credit card required. Experience all Premium features.
                </p>
              </div>
            </div>
            <Button
              variant="cyan"
              onClick={handleStartTrial}
              isLoading={loading === 'trial'}
            >
              Start Free Trial
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current subscription */}
      {currentTier !== 'FREE' && (
        <Card className="border-brand-indigo/20">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Badge
                variant={currentTier === 'PREMIUM' ? 'premium' : 'pro'}
                className="text-base px-4 py-1.5"
              >
                {currentTier}
              </Badge>
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  {isTrialing ? 'Trial Active' : 'Current Plan'}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {subscription.expiresAt
                    ? `${isTrialing ? 'Trial ends' : 'Renews'} on ${new Date(subscription.expiresAt).toLocaleDateString()}`
                    : 'Active subscription'}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={handleManageSubscription}
              isLoading={loading === 'manage'}
              rightIcon={<ExternalLink className="h-4 w-4" />}
            >
              Manage Subscription
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-4 rounded-xl bg-[var(--bg-secondary)] p-1 border border-[var(--border)]">
          <button
            onClick={() => setInterval('monthly')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              interval === 'monthly'
                ? 'bg-brand-indigo text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('annual')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              interval === 'annual'
                ? 'bg-brand-indigo text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            Annual
            <Badge variant="cyan" className="text-[10px]">
              Save 17%
            </Badge>
          </button>
        </div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((plan) => {
          const price = interval === 'monthly' ? plan.monthlyPrice : plan.annualPrice
          const monthlyEquivalent =
            interval === 'annual' ? (plan.annualPrice / 12).toFixed(2) : null
          const isCurrentPlan = currentTier === plan.tier
          const canUpgrade = currentTier === 'FREE' || (currentTier === 'PRO' && plan.tier === 'PREMIUM')

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative overflow-hidden',
                plan.popular && 'border-brand-indigo ring-2 ring-brand-indigo/20'
              )}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0">
                  <div className="bg-brand-indigo text-white text-xs font-medium px-3 py-1 rounded-bl-lg">
                    Most Popular
                  </div>
                </div>
              )}

              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl',
                      plan.tier === 'PREMIUM'
                        ? 'bg-gradient-to-br from-brand-indigo to-brand-cyan text-white'
                        : 'bg-brand-indigo/10 text-brand-indigo'
                    )}
                  >
                    {plan.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{plan.name}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{plan.description}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[var(--text-primary)]">
                      ${price.toFixed(2)}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      /{interval === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </div>
                  {monthlyEquivalent && (
                    <p className="text-sm text-[var(--text-tertiary)]">
                      ${monthlyEquivalent}/mo billed annually
                    </p>
                  )}
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0',
                          feature.included
                            ? feature.highlight
                              ? 'bg-brand-cyan/20 text-brand-cyan'
                              : 'bg-green-500/20 text-green-500'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span
                        className={cn(
                          'text-sm',
                          feature.included
                            ? 'text-[var(--text-primary)]'
                            : 'text-[var(--text-tertiary)] line-through'
                        )}
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.popular ? 'cyan' : 'primary'}
                  className="w-full"
                  onClick={() => handleSubscribe(plan)}
                  isLoading={loading === plan.id}
                  disabled={isCurrentPlan || !canUpgrade}
                >
                  {isCurrentPlan
                    ? 'Current Plan'
                    : canUpgrade
                    ? `Upgrade to ${plan.name}`
                    : 'Downgrade in Portal'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Features comparison */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-6 text-center">
          Why Upgrade?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-indigo/10 mx-auto mb-3">
              <Sparkles className="h-6 w-6 text-brand-indigo" />
            </div>
            <h4 className="font-medium text-[var(--text-primary)] mb-1">Better Quality</h4>
            <p className="text-sm text-[var(--text-secondary)]">
              Access advanced AI models for superior prompt enhancement
            </p>
          </div>
          <div className="text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-cyan/10 mx-auto mb-3">
              <Layers className="h-6 w-6 text-brand-cyan" />
            </div>
            <h4 className="font-medium text-[var(--text-primary)] mb-1">More Prompts</h4>
            <p className="text-sm text-[var(--text-secondary)]">
              Enhance up to unlimited prompts daily with Premium
            </p>
          </div>
          <div className="text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 mx-auto mb-3">
              <Download className="h-6 w-6 text-green-500" />
            </div>
            <h4 className="font-medium text-[var(--text-primary)] mb-1">Export & Share</h4>
            <p className="text-sm text-[var(--text-secondary)]">
              Export your enhanced prompts to PDF, TXT, or Markdown
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
