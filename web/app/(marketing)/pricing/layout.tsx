import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing - Promptomize',
  description: 'Choose the perfect plan for AI prompt enhancement. Free, Pro ($4.99/mo), or Premium ($14.99/mo) with a 7-day free trial. Upgrade for more prompts, better quality, and advanced features.',
  keywords: [
    'promptomize pricing',
    'AI prompt subscription',
    'prompt enhancement plans',
    'AI prompt tools pricing',
    'AI writing assistant cost',
  ],
  openGraph: {
    title: 'Pricing - Promptomize',
    description: 'Choose the perfect plan for AI prompt enhancement. Start free or upgrade for more features.',
    url: 'https://promptomize.app/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Pricing - Promptomize',
    description: 'Choose the perfect plan for AI prompt enhancement. Start free or upgrade for more features.',
  },
  alternates: {
    canonical: '/pricing',
  },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
