'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Sparkles, Zap, Shield, Crown, Check, ArrowRight, Star, MessageSquare, Layers, Smartphone } from 'lucide-react'
import { useSettingsStore } from '@/lib/stores/settingsStore'
import PromptComparison from '@/components/hero/PromptComparison'

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Enhancement',
    description: 'Transform simple prompts into detailed, optimized instructions using advanced prompt engineering techniques.',
  },
  {
    icon: Zap,
    title: 'Instant Results',
    description: 'Get enhanced prompts in seconds. No waiting, no complexity - just better AI interactions.',
  },
  {
    icon: Layers,
    title: 'Tiered Quality',
    description: 'Choose from Basic, Standard, or Advanced prompt quality based on your needs.',
  },
  {
    icon: MessageSquare,
    title: 'Prompt History',
    description: 'Save and revisit your enhanced prompts. Build a library of optimized prompts over time.',
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
    features: [
      '10 prompts per day',
      'Basic prompt quality',
      'Prompt history',
      'Dark mode support',
    ],
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
  const isDark = typeof window !== 'undefined'
    ? appearanceMode === 'dark' || (appearanceMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
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
            description: 'AI-powered prompt enhancement tool that transforms simple ideas into powerful, optimized instructions for any AI.',
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
      <nav className="fixed top-0 left-0 right-0 z-50 glass" role="navigation" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3" aria-label="Promptomize Home">
              <Logo size={40} className="rounded-xl" />
              <span className="text-xl font-semibold" itemProp="name">Promptomize</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="#features" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
                Features
              </Link>
              <Link href="#pricing" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
                Pricing
              </Link>
              <Link href="/privacy" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
                Privacy
              </Link>
              <Link href="/login" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
                Sign In
              </Link>
              <a
                href="https://apps.apple.com/us/app/promptomize/id6758075605"
                className="btn-cyan px-4 py-2 rounded-full font-medium flex items-center gap-2"
                rel="noopener noreferrer"
                aria-label="Download Promptomize on the App Store"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Dark Background for Logo Contrast */}
      <section
        className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#0a0a1a] via-[#0d0d24] to-[#000000] overflow-hidden"
        aria-labelledby="hero-heading"
      >
        {/* Animated gradient background */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#5B4CDB]/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00E6E6]/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative max-w-7xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm mb-8 border border-[#00E6E6]/30 backdrop-blur-sm">
              <Star className="w-4 h-4 text-[#00E6E6]" aria-hidden="true" />
              <span>Now available on the App Store</span>
            </div>
            <h1 id="hero-heading" className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-white">
              Transform Your
              <span className="gradient-text block" itemProp="description">AI Prompts</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-10">
              Promptomize uses advanced prompt engineering to transform your simple ideas into
              powerful, optimized instructions that get better results from any AI.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://apps.apple.com/us/app/promptomize/id6758075605"
                className="w-full sm:w-auto btn-cyan px-8 py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3"
                rel="noopener noreferrer"
                aria-label="Download Promptomize for iOS from the App Store"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Download for iOS
              </a>
              <Link
                href="/login"
                className="w-full sm:w-auto bg-white/10 text-white px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-white/20 transition flex items-center justify-center gap-2 border border-white/20"
              >
                Try Web App
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* Animated Prompt Comparison Section */}
      <PromptComparison />

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]" aria-labelledby="features-heading">
        <div className="max-w-7xl mx-auto">
          <header className="text-center mb-16">
            <h2 id="features-heading" className="text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
              Everything you need to create better AI prompts
            </p>
          </header>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8" role="list">
            {features.map((feature, index) => (
              <article
                key={index}
                className="feature-card bg-[var(--bg-primary)] p-8 rounded-3xl border border-[var(--border)]"
                role="listitem"
              >
                <div className="w-14 h-14 bg-[var(--brand-accent)]/20 rounded-2xl flex items-center justify-center mb-6" aria-hidden="true">
                  <feature.icon className="w-7 h-7 text-[var(--accent-cyan)]" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-[var(--text-secondary)]">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8" aria-labelledby="pricing-heading">
        <div className="max-w-7xl mx-auto">
          <header className="text-center mb-16">
            <h2 id="pricing-heading" className="text-4xl font-bold mb-4">Simple Pricing</h2>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
              Choose the plan that works for you
            </p>
          </header>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-stretch" role="list">
            {pricingPlans.map((plan, index) => (
              <article
                key={index}
                className={`relative bg-[var(--bg-secondary)] p-8 rounded-3xl border flex flex-col ${
                  plan.popular ? 'border-[var(--accent-cyan)] glow-cyan' : 'border-[var(--border)]'
                }`}
                role="listitem"
                itemScope
                itemType="https://schema.org/Offer"
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-[var(--accent-cyan)] text-[var(--text-on-accent)] px-4 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center mb-8">
                  <h3 className="text-xl font-semibold mb-2" itemProp="name">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold" itemProp="price">{plan.price}</span>
                    <span className="text-[var(--text-secondary)]" itemProp="priceCurrency">{plan.period}</span>
                  </div>
                  <p className="text-[var(--text-tertiary)] mt-2" itemProp="description">{plan.description}</p>
                </div>
                <ul className="space-y-4 flex-grow" aria-label={`${plan.name} plan features`}>
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-[var(--accent-cyan)] flex-shrink-0" aria-hidden="true" />
                      <span className="text-[var(--text-secondary)]">{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="https://apps.apple.com/us/app/promptomize/id6758075605"
                  className={`block w-full py-3 rounded-xl font-semibold text-center transition mt-8 ${
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
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]" aria-labelledby="cta-heading">
        <div className="max-w-4xl mx-auto text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-[var(--brand-accent)] rounded-2xl flex items-center justify-center glow-cyan" aria-hidden="true">
            <Crown className="w-8 h-8 text-white dark:text-black" />
          </div>
          <h2 id="cta-heading" className="text-4xl font-bold mb-4">Ready to Enhance Your Prompts?</h2>
          <p className="text-xl text-[var(--text-secondary)] mb-8">
            Join thousands of users who are getting better results from AI with Promptomize.
          </p>
          <a
            href="https://apps.apple.com/us/app/promptomize/id6758075605"
            className="inline-flex items-center gap-3 btn-cyan px-8 py-4 rounded-2xl font-semibold text-lg"
            rel="noopener noreferrer"
            aria-label="Download Promptomize on the App Store"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Download on the App Store
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-[var(--border)]" role="contentinfo">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-4" aria-label="Promptomize Home">
                <Logo size={32} className="rounded-lg" />
                <span className="text-lg font-semibold">Promptomize</span>
              </Link>
              <p className="text-[var(--text-secondary)] max-w-sm">
                Transform your prompts into powerful, optimized instructions for any AI.
              </p>
            </div>
            <nav aria-label="Product links">
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-[var(--text-secondary)]">
                <li><Link href="#features" className="hover:text-[var(--accent-cyan)] transition">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-[var(--accent-cyan)] transition">Pricing</Link></li>
                <li><a href="https://apps.apple.com/us/app/promptomize/id6758075605" className="hover:text-[var(--accent-cyan)] transition" rel="noopener noreferrer">Download</a></li>
              </ul>
            </nav>
            <nav aria-label="Legal links">
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-[var(--text-secondary)]">
                <li><Link href="/privacy" className="hover:text-[var(--accent-cyan)] transition">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-[var(--accent-cyan)] transition">Terms of Service</Link></li>
                <li><Link href="/support" className="hover:text-[var(--accent-cyan)] transition">Support</Link></li>
              </ul>
            </nav>
          </div>
          <div className="mt-12 pt-8 border-t border-[var(--border)] text-center text-[var(--text-tertiary)]">
            <p>&copy; {new Date().getFullYear()} Promptomize. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
