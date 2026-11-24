'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  Sparkles,
  Zap,
  Shield,
  Crown,
  Check,
  ArrowRight,
  Star,
  MessageSquare,
  Layers,
  Smartphone,
  PlayCircle,
} from 'lucide-react'
import { useSettingsStore } from '@/lib/stores/settingsStore'
import PromptComparison from '@/components/hero/PromptComparison'

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Enhancement',
    description:
      'Transform simple prompts into detailed, optimized instructions using advanced prompt engineering techniques.',
  },
  {
    icon: Zap,
    title: 'Instant Results',
    description:
      'Get enhanced prompts in seconds. No waiting, no complexity - just better AI interactions.',
  },
  {
    icon: Layers,
    title: 'Tiered Quality',
    description: 'Choose from Basic, Standard, or Advanced prompt quality based on your needs.',
  },
  {
    icon: MessageSquare,
    title: 'Prompt History',
    description:
      'Save and revisit your enhanced prompts. Build a library of optimized prompts over time.',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your prompts are processed securely. We never store or share your content.',
  },
  {
    icon: Smartphone,
    title: 'Native iOS App',
    description: 'Beautiful, fast native app designed for iPhone and iPad with dark mode support.',
  },
]

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Perfect for getting started',
    features: ['10 prompts per day', 'Basic prompt quality', 'Prompt history', 'Dark mode support'],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$4.99',
    period: '/month',
    description: 'For regular users',
    features: [
      '100 prompts per day',
      'Standard prompt quality',
      'Export prompts',
      'Priority support',
      'All Free features',
    ],
    cta: 'Start Pro',
    popular: false,
  },
  {
    name: 'Premium',
    price: '$9.99',
    period: '/month',
    description: 'For power users',
    features: [
      'Unlimited prompts',
      'Advanced prompt quality',
      '7-day free trial',
      'All Pro features',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
]

// Logo component that handles light/dark mode
function Logo({ className = '', size = 40 }: { className?: string; size?: number }) {
  const { appearanceMode } = useSettingsStore()

  // Determine if we should show dark logo
  const isDark =
    typeof window !== 'undefined'
      ? appearanceMode === 'dark' ||
        (appearanceMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      : true

  return (
    <Image
      src={isDark ? '/logo.png' : '/logo-light.png'}
      alt="Promptomize - AI Prompt Enhancement"
      width={size}
      height={size}
      className={className}
      priority
    />
  )
}

export default function Home() {
  return (
    <main className="min-h-screen" itemScope itemType="https://schema.org/WebApplication">
      {/* Hidden structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Promptomize',
            description:
              'AI-powered prompt enhancement tool that transforms simple ideas into powerful, optimized instructions for any AI.',
            url: 'https://promptomize.app',
            applicationCategory: 'Productivity',
            operatingSystem: 'iOS, Web',
            offers: [
              {
                '@type': 'Offer',
                name: 'Free',
                price: '0',
                priceCurrency: 'USD',
              },
              {
                '@type': 'Offer',
                name: 'Pro',
                price: '4.99',
                priceCurrency: 'USD',
                priceValidUntil: '2027-12-31',
              },
              {
                '@type': 'Offer',
                name: 'Premium',
                price: '9.99',
                priceCurrency: 'USD',
                priceValidUntil: '2027-12-31',
              },
            ],
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '4.8',
              ratingCount: '1250',
            },
          }),
        }}
      />

      {/* Navigation */}
      <nav
        className="glass fixed left-0 right-0 top-0 z-50"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3" aria-label="Promptomize Home">
              <Logo size={40} className="rounded-xl" />
              <span className="text-xl font-semibold" itemProp="name">
                Promptomize
              </span>
            </Link>
            <div className="hidden items-center gap-8 md:flex">
              <Link
                href="#features"
                className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Features
              </Link>
              <Link
                href="#pricing"
                className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Pricing
              </Link>
              <Link
                href="/demo"
                className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Demo
              </Link>
              <Link
                href="/privacy"
                className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Privacy
              </Link>
              <Link
                href="/login"
                className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Sign In
              </Link>
              <a
                href="https://apps.apple.com/us/app/promptomize/id6758075605"
                className="btn-cyan flex items-center gap-2 rounded-full px-4 py-2 font-medium"
                rel="noopener noreferrer"
                aria-label="Download Promptomize on the App Store"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Dark Background for Logo Contrast */}
      <section
        className="relative overflow-hidden bg-gradient-to-b from-[#0a0a1a] via-[#0d0d24] to-[#000000] px-4 pb-20 pt-32 sm:px-6 lg:px-8"
        aria-labelledby="hero-heading"
      >
        {/* Animated gradient background */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-[#5B4CDB]/30 blur-3xl" />
          <div
            className="absolute bottom-1/4 right-1/4 h-96 w-96 animate-pulse rounded-full bg-[#00E6E6]/20 blur-3xl"
            style={{ animationDelay: '1s' }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <div className="text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#00E6E6]/30 bg-white/5 px-4 py-2 text-sm text-gray-300 backdrop-blur-sm">
              <Star className="h-4 w-4 text-[#00E6E6]" aria-hidden="true" />
              <span>Now available on the App Store</span>
            </div>
            <h1
              id="hero-heading"
              className="mb-6 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl"
            >
              Transform Your
              <span className="gradient-text block" itemProp="description">
                AI Prompts
              </span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-300">
              Promptomize uses advanced prompt engineering to transform your simple ideas into
              powerful, optimized instructions that get better results from any AI.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="https://apps.apple.com/us/app/promptomize/id6758075605"
                className="btn-cyan flex w-full items-center justify-center gap-3 rounded-2xl px-8 py-4 text-lg font-semibold sm:w-auto"
                rel="noopener noreferrer"
                aria-label="Download Promptomize for iOS from the App Store"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Download for iOS
              </a>
              <Link
                href="/demo"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-lg font-semibold text-white transition hover:bg-white/20 sm:w-auto"
              >
                Watch Demo
                <PlayCircle className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-lg font-semibold text-white transition hover:bg-white/20 sm:w-auto"
              >
                Try Web App
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Animated Prompt Comparison Section */}
      <PromptComparison />

      {/* Features Section */}
      <section
        id="features"
        className="bg-[var(--bg-secondary)] px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="features-heading"
      >
        <div className="mx-auto max-w-7xl">
          <header className="mb-16 text-center">
            <h2 id="features-heading" className="mb-4 text-4xl font-bold">
              Powerful Features
            </h2>
            <p className="mx-auto max-w-2xl text-xl text-[var(--text-secondary)]">
              Everything you need to create better AI prompts
            </p>
          </header>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3" role="list">
            {features.map((feature, index) => (
              <article
                key={index}
                className="feature-card rounded-3xl border border-[var(--border)] bg-[var(--bg-primary)] p-8"
                role="listitem"
              >
                <div
                  className="bg-[var(--brand-accent)]/20 mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
                  aria-hidden="true"
                >
                  <feature.icon className="h-7 w-7 text-[var(--accent-cyan)]" />
                </div>
                <h3 className="mb-3 text-xl font-semibold">{feature.title}</h3>
                <p className="text-[var(--text-secondary)]">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section
        id="pricing"
        className="px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="pricing-heading"
      >
        <div className="mx-auto max-w-7xl">
          <header className="mb-16 text-center">
            <h2 id="pricing-heading" className="mb-4 text-4xl font-bold">
              Simple Pricing
            </h2>
            <p className="mx-auto max-w-2xl text-xl text-[var(--text-secondary)]">
              Choose the plan that works for you
            </p>
          </header>
          <div className="mx-auto grid max-w-5xl items-stretch gap-8 md:grid-cols-3" role="list">
            {pricingPlans.map((plan, index) => (
              <article
                key={index}
                className={`relative flex flex-col rounded-3xl border bg-[var(--bg-secondary)] p-8 ${
                  plan.popular ? 'glow-cyan border-[var(--accent-cyan)]' : 'border-[var(--border)]'
                }`}
                role="listitem"
                itemScope
                itemType="https://schema.org/Offer"
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[var(--accent-cyan)] px-4 py-1 text-sm font-medium text-[var(--text-on-accent)]">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="mb-8 text-center">
                  <h3 className="mb-2 text-xl font-semibold" itemProp="name">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold" itemProp="price">
                      {plan.price}
                    </span>
                    <span className="text-[var(--text-secondary)]" itemProp="priceCurrency">
                      {plan.period}
                    </span>
                  </div>
                  <p className="mt-2 text-[var(--text-tertiary)]" itemProp="description">
                    {plan.description}
                  </p>
                </div>
                <ul className="flex-grow space-y-4" aria-label={`${plan.name} plan features`}>
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-center gap-3">
                      <Check
                        className="h-5 w-5 flex-shrink-0 text-[var(--accent-cyan)]"
                        aria-hidden="true"
                      />
                      <span className="text-[var(--text-secondary)]">{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="https://apps.apple.com/us/app/promptomize/id6758075605"
                  className={`mt-8 block w-full rounded-xl py-3 text-center font-semibold transition ${
                    plan.popular
                      ? 'btn-cyan'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border)]'
                  }`}
                  rel="noopener noreferrer"
                  aria-label={`${plan.cta} - ${plan.name} plan`}
                >
                  {plan.cta}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        className="bg-[var(--bg-secondary)] px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="cta-heading"
      >
        <div className="mx-auto max-w-4xl text-center">
          <div
            className="glow-cyan mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-accent)]"
            aria-hidden="true"
          >
            <Crown className="h-8 w-8 text-white dark:text-black" />
          </div>
          <h2 id="cta-heading" className="mb-4 text-4xl font-bold">
            Ready to Enhance Your Prompts?
          </h2>
          <p className="mb-8 text-xl text-[var(--text-secondary)]">
            Join thousands of users who are getting better results from AI with Promptomize.
          </p>
          <a
            href="https://apps.apple.com/us/app/promptomize/id6758075605"
            className="btn-cyan inline-flex items-center gap-3 rounded-2xl px-8 py-4 text-lg font-semibold"
            rel="noopener noreferrer"
            aria-label="Download Promptomize on the App Store"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="border-t border-[var(--border)] px-4 py-12 sm:px-6 lg:px-8"
        role="contentinfo"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <Link href="/" className="mb-4 flex items-center gap-3" aria-label="Promptomize Home">
                <Logo size={32} className="rounded-lg" />
                <span className="text-lg font-semibold">Promptomize</span>
              </Link>
              <p className="max-w-sm text-[var(--text-secondary)]">
                Transform your prompts into powerful, optimized instructions for any AI.
              </p>
            </div>
            <nav aria-label="Product links">
              <h4 className="mb-4 font-semibold">Product</h4>
              <ul className="space-y-2 text-[var(--text-secondary)]">
                <li>
                  <Link href="#features" className="transition hover:text-[var(--accent-cyan)]">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="transition hover:text-[var(--accent-cyan)]">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="transition hover:text-[var(--accent-cyan)]">
                    Demo
                  </Link>
                </li>
                <li>
                  <a
                    href="https://apps.apple.com/us/app/promptomize/id6758075605"
                    className="transition hover:text-[var(--accent-cyan)]"
                    rel="noopener noreferrer"
                  >
                    Download
                  </a>
                </li>
              </ul>
            </nav>
            <nav aria-label="Legal links">
              <h4 className="mb-4 font-semibold">Legal</h4>
              <ul className="space-y-2 text-[var(--text-secondary)]">
                <li>
                  <Link href="/privacy" className="transition hover:text-[var(--accent-cyan)]">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="transition hover:text-[var(--accent-cyan)]">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/support" className="transition hover:text-[var(--accent-cyan)]">
                    Support
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-12 border-t border-[var(--border)] pt-8 text-center text-[var(--text-tertiary)]">
            <p>&copy; {new Date().getFullYear()} Promptomize. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
