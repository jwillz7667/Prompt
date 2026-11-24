import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Crown } from 'lucide-react'
import {
  PREMIUM_PLAN,
  PREMIUM_TRIAL_SUMMARY,
  premiumRenewalTerms,
} from '@/lib/billing/premium-plan'

const faqs = [
  {
    question: 'Is there a free plan?',
    answer: `No. Promptomize is a single Premium plan. New subscribers get a ${PREMIUM_PLAN.trialDays}-day free trial, and you won't be charged if you cancel before it ends.`,
  },
  {
    question: 'Why do you ask for a card to start the trial?',
    answer: `The trial converts to ${PREMIUM_PLAN.priceLabel}/${PREMIUM_PLAN.intervalLabel} when it ends so your access isn't interrupted. Cancel before then and you won't be charged.`,
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer:
      "Yes. Cancel from Manage subscription on the web, or in your Apple Account settings if you subscribed in the iOS app. You'll keep Premium until the end of the period you've paid for.",
  },
  {
    question: 'Do you offer refunds?',
    answer:
      "If you're not satisfied within the first 30 days of a paid web subscription, contact us for a refund. Purchases made in the iOS app are refunded by Apple.",
  },
  {
    question: 'Is my subscription shared between iOS and web?',
    answer:
      'Yes. Sign in with the same account on iOS and the web and Premium unlocks on both, along with your prompt history.',
  },
]

export default function PricingPage() {
  return (
    <div className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-bold text-[var(--text-primary)] md:text-5xl">
            One plan. Everything included.
          </h1>
          <p className="text-xl text-[var(--text-secondary)]">{PREMIUM_TRIAL_SUMMARY}.</p>
        </div>

        <Card className="mx-auto max-w-md overflow-hidden border-brand-indigo ring-2 ring-brand-indigo/20">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo text-white dark:bg-brand-cyan dark:text-black">
                <Crown className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{PREMIUM_PLAN.name}</h2>
            </div>

            <div>
              <span className="text-5xl font-bold text-[var(--text-primary)]">
                {PREMIUM_PLAN.priceLabel}
              </span>
              <span className="text-lg text-[var(--text-secondary)]">
                /{PREMIUM_PLAN.intervalLabel}
              </span>
              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
                {PREMIUM_TRIAL_SUMMARY}
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

            <Link href="/upgrade">
              <Button variant="cyan" size="lg" className="w-full">
                Start {PREMIUM_PLAN.trialDays}-day free trial
              </Button>
            </Link>

            <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
              {premiumRenewalTerms(true)} See the{' '}
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

        <div className="mx-auto mt-24 max-w-3xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-[var(--text-primary)]">
            Frequently Asked Questions
          </h2>
          <div className="space-y-8">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="mb-2 font-semibold text-[var(--text-primary)]">{faq.question}</h3>
                <p className="text-[var(--text-secondary)]">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
