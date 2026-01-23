'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Sparkles, Zap, Shield, Crown, Check, ArrowRight, Star, MessageSquare, Layers, Smartphone } from 'lucide-react'

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
      'Batch mode',
      '7-day free trial',
      'All Pro features',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
]

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Promptomize"
                width={40}
                height={40}
                className="rounded-xl"
              />
              <span className="text-xl font-semibold">Promptomize</span>
            </div>
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
              <a
                href="https://apps.apple.com/app/promptomize/id6738850382"
                className="btn-cyan px-4 py-2 rounded-full font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-sm mb-8 border border-[var(--accent-cyan)] border-opacity-30">
              <Star className="w-4 h-4 text-[var(--accent-cyan)]" />
              <span>Now available on the App Store</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              Transform Your
              <span className="gradient-text block">AI Prompts</span>
            </h1>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10">
              Promptomize uses advanced prompt engineering to transform your simple ideas into
              powerful, optimized instructions that get better results from any AI.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://apps.apple.com/app/promptomize/id6738850382"
                className="w-full sm:w-auto btn-cyan px-8 py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Download for iOS
              </a>
              <Link
                href="#features"
                className="w-full sm:w-auto bg-[var(--bg-secondary)] text-[var(--text-primary)] px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-[var(--bg-tertiary)] transition flex items-center justify-center gap-2"
              >
                Learn More
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* App Preview */}
          <div className="mt-20 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-[#512AD4]/30 to-[#00FFF9]/30 blur-3xl -z-10" />
            <div className="flex justify-center">
              <div className="relative">
                <Image
                  src="/app-icon.png"
                  alt="Promptomize App"
                  width={300}
                  height={300}
                  className="rounded-[60px] shadow-2xl glow-cyan"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
              Everything you need to create better AI prompts
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="feature-card bg-[var(--bg-primary)] p-8 rounded-3xl border border-[var(--border)]"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-[#512AD4]/20 to-[#00FFF9]/20 rounded-2xl flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7 text-[var(--accent-cyan)]" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-[var(--text-secondary)]">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple Pricing</h2>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
              Choose the plan that works for you
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`relative bg-[var(--bg-secondary)] p-8 rounded-3xl border ${
                  plan.popular ? 'border-[var(--accent-cyan)] glow-cyan' : 'border-[var(--border)]'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-[var(--accent-cyan)] text-[var(--text-on-accent)] px-4 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center mb-8">
                  <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-[var(--text-secondary)]">{plan.period}</span>
                  </div>
                  <p className="text-[var(--text-tertiary)] mt-2">{plan.description}</p>
                </div>
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-[var(--accent-cyan)] flex-shrink-0" />
                      <span className="text-[var(--text-secondary)]">{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="https://apps.apple.com/app/promptomize/id6738850382"
                  className={`block w-full py-3 rounded-xl font-semibold text-center transition ${
                    plan.popular
                      ? 'btn-cyan'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border)]'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-[#512AD4] to-[#00FFF9] rounded-2xl flex items-center justify-center glow-cyan">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-4xl font-bold mb-4">Ready to Enhance Your Prompts?</h2>
          <p className="text-xl text-[var(--text-secondary)] mb-8">
            Join thousands of users who are getting better results from AI with Promptomize.
          </p>
          <a
            href="https://apps.apple.com/app/promptomize/id6738850382"
            className="inline-flex items-center gap-3 btn-cyan px-8 py-4 rounded-2xl font-semibold text-lg"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Download on the App Store
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/logo.png"
                  alt="Promptomize"
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
                <span className="text-lg font-semibold">Promptomize</span>
              </div>
              <p className="text-[var(--text-secondary)] max-w-sm">
                Transform your prompts into powerful, optimized instructions for any AI.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-[var(--text-secondary)]">
                <li><Link href="#features" className="hover:text-[var(--accent-cyan)] transition">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-[var(--accent-cyan)] transition">Pricing</Link></li>
                <li><a href="https://apps.apple.com/app/promptomize/id6738850382" className="hover:text-[var(--accent-cyan)] transition">Download</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-[var(--text-secondary)]">
                <li><Link href="/privacy" className="hover:text-[var(--accent-cyan)] transition">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-[var(--accent-cyan)] transition">Terms of Service</Link></li>
                <li><Link href="/support" className="hover:text-[var(--accent-cyan)] transition">Support</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-[var(--border)] text-center text-[var(--text-tertiary)]">
            <p>&copy; {new Date().getFullYear()} Promptomize. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
