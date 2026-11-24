import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing - Promptomize',
  description:
    'Promptomize Premium: the prompt optimizer and AI chat assistant on web and iOS. 3-day free trial, then $9.99/month, cancel anytime.',
  keywords: [
    'promptomize pricing',
    'AI prompt subscription',
    'prompt enhancement plans',
    'AI prompt tools pricing',
    'AI writing assistant cost',
  ],
  openGraph: {
    title: 'Pricing - Promptomize',
    description: 'One plan with everything: 3-day free trial, then $9.99/month, cancel anytime.',
    url: 'https://promptomize.app/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Pricing - Promptomize',
    description: 'One plan with everything: 3-day free trial, then $9.99/month, cancel anytime.',
  },
  alternates: {
    canonical: '/pricing',
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
