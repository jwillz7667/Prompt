'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import { Check, Crown, Zap, Sparkles } from 'lucide-react'

const plans = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for getting started',
    features: [
      '10 daily prompts',
      'Basic quality enhancements',
      'Up to 4K tokens per prompt',
      'Prompt history',
      'Basic templates',
    ],
    cta: 'Get Started',
    href: '/login',
    variant: 'secondary' as const,
  },
  {
    name: 'Pro',
    price: 4.99,
    description: 'For regular users',
    features: [
      '100 daily prompts',
      'Standard quality enhancements',
      'Up to 8K tokens per prompt',
      'Export to PDF/TXT/MD',
      'Custom templates',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    href: '/login',
    variant: 'primary' as const,
    popular: false,
    icon: <Zap className="h-5 w-5" />,
  },
  {
    name: 'Premium',
    price: 14.99,
    description: 'For power users',
    features: [
      'Unlimited daily prompts',
      'Advanced quality enhancements',
      'Up to 64K tokens per prompt',
      'Deep Think mode',
      'Export to all formats',
      'Priority support',
      'Collections & organization',
    ],
    cta: 'Start Free Trial',
    href: '/login',
    variant: 'cyan' as const,
    popular: true,
    icon: <Crown className="h-5 w-5" />,
  },
]

export default function PricingPage() {
  return (
    <div className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-bold text-[var(--text-primary)] md:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-[var(--text-secondary)]">
            Choose the plan that's right for you. Start with a 7-day free trial on paid plans.
          </p>
        </div>

        {/* Plans */}
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                'relative overflow-hidden',
                plan.popular && 'border-brand-indigo ring-2 ring-brand-indigo/20',
              )}
            >
              {plan.popular && (
                <div className="absolute right-0 top-0">
                  <div className="rounded-bl-lg bg-brand-indigo px-3 py-1 text-xs font-medium text-white">
                    Most Popular
                  </div>
                </div>
              )}

              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  {plan.icon && (
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl',
                        plan.name === 'Premium'
                          ? 'bg-brand-indigo text-white dark:bg-brand-cyan dark:text-black'
                          : 'bg-brand-indigo/10 text-brand-indigo dark:bg-brand-cyan/10 dark:text-brand-cyan',
                      )}
                    >
                      {plan.icon}
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-[var(--text-primary)]">{plan.name}</h3>
                </div>

                <p className="mb-4 text-sm text-[var(--text-secondary)]">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-[var(--text-primary)]">
                    ${plan.price}
                  </span>
                  {plan.price > 0 && <span className="text-[var(--text-secondary)]">/month</span>}
                </div>

                <ul className="mb-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20 text-green-500">
                        <Check className="h-3 w-3" />
                      </div>
                      <span className="text-sm text-[var(--text-primary)]">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href={plan.href}>
                  <Button variant={plan.variant} className="w-full">
                    {plan.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="mx-auto mt-24 max-w-3xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-[var(--text-primary)]">
            Frequently Asked Questions
          </h2>

          <div className="space-y-8">
            <div>
              <h3 className="mb-2 font-semibold text-[var(--text-primary)]">
                What happens when I reach my daily limit?
              </h3>
              <p className="text-[var(--text-secondary)]">
                You can still access your history and templates, but you won't be able to enhance
                new prompts until the next day. Consider upgrading for more prompts.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-[var(--text-primary)]">
                Can I cancel my subscription anytime?
              </h3>
              <p className="text-[var(--text-secondary)]">
                Yes, you can cancel your subscription at any time. You'll continue to have access to
                paid features until the end of your billing period.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-[var(--text-primary)]">
                Do you offer refunds?
              </h3>
              <p className="text-[var(--text-secondary)]">
                We offer a 7-day free trial on paid plans. If you're not satisfied within the first
                30 days of your paid subscription, contact us for a refund.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-[var(--text-primary)]">
                Is my subscription shared between iOS and web?
              </h3>
              <p className="text-[var(--text-secondary)]">
                Your account and subscription are shared across all platforms. Sign in with the same
                account on iOS and web to access your prompts everywhere.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
