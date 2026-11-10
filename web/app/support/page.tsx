import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, MessageCircle, FileText, HelpCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Support & Help Center - Promptomize',
  description:
    'Get help with Promptomize AI prompt enhancement. Find answers to FAQs about subscriptions, prompts, billing, and more. Contact our support team.',
  keywords: [
    'promptomize support',
    'promptomize help',
    'AI prompt help',
    'promptomize FAQ',
    'prompt enhancement support',
  ],
  openGraph: {
    title: 'Support & Help Center - Promptomize',
    description: 'Get help with Promptomize. Find answers to FAQs or contact support.',
    url: 'https://promptomize.app/support',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Support & Help Center - Promptomize',
    description: 'Get help with Promptomize. Find answers to FAQs or contact support.',
  },
  alternates: {
    canonical: '/support',
  },
}

const faqs = [
  {
    question: 'How does Promptomize enhance my prompts?',
    answer:
      'Promptomize uses advanced prompt engineering techniques to transform your simple ideas into detailed, structured prompts. It applies methods like chain-of-thought reasoning, role assignment, and constraint engineering to help you get better results from AI systems.',
  },
  {
    question: 'What is the difference between prompt quality tiers?',
    answer:
      'Basic prompts (Free tier) include essential structuring and clarity improvements. Standard prompts (Pro tier) add techniques like RISEN framework and few-shot examples. Advanced prompts (Premium tier) include all techniques including tree-of-thought, meta-cognitive triggers, and instruction hierarchy.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      'You can cancel your subscription through your Apple ID settings: Go to Settings > [Your Name] > Subscriptions > Promptomize > Cancel Subscription. Your subscription will remain active until the end of the current billing period.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Refunds are handled by Apple. To request a refund, visit reportaproblem.apple.com, sign in with your Apple ID, and select the purchase you want to request a refund for.',
  },
  {
    question: 'How do I restore my purchases on a new device?',
    answer:
      'Open Promptomize on your new device, go to Profile > Subscription, and tap "Restore Purchases". Make sure you are signed in with the same Apple ID you used to make the original purchase.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes, we take security seriously. All data is encrypted in transit and at rest. We never share your prompts with third parties for advertising purposes, and you can delete your data at any time through the app settings.',
  },
  {
    question: 'What happens when I reach my daily prompt limit?',
    answer:
      'When you reach your daily limit, you will see a message indicating that you have used all your prompts for the day. Your limit resets at midnight UTC. You can upgrade your plan for higher limits or wait until the next day.',
  },
  {
    question: 'Can I use Promptomize offline?',
    answer:
      'Promptomize requires an internet connection to enhance prompts since the AI processing happens on our servers. However, you can view your saved prompt history while offline.',
  },
]

// Generate FAQ structured data for SEO
const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
}

export default function Support() {
  return (
    <main className="min-h-screen">
      {/* FAQ Structured Data for Google Rich Results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData),
        }}
      />
      {/* Navigation */}
      <nav className="glass fixed left-0 right-0 top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Promptomize"
                width={40}
                height={40}
                className="rounded-xl"
              />
              <span className="text-xl font-semibold">Promptomize</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-16 text-center">
            <h1 className="mb-4 text-4xl font-bold">How can we help?</h1>
            <p className="text-xl text-[var(--text-secondary)]">
              Find answers to common questions or get in touch with our support team.
            </p>
          </div>

          {/* Contact Options */}
          <div className="mb-16 grid gap-6 md:grid-cols-2">
            <a
              href="mailto:support@promptomize.app"
              className="feature-card flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold">Email Support</h3>
                <p className="text-sm text-[var(--text-secondary)]">support@promptomize.app</p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                  We typically respond within 24 hours
                </p>
              </div>
            </a>

            <div className="feature-card flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold">In-App Feedback</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Go to Profile &gt; Help &amp; Support
                </p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                  Send feedback directly from the app
                </p>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="mb-16 grid gap-4 sm:grid-cols-2">
            <Link
              href="/privacy"
              className="flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] p-4 transition hover:bg-[var(--bg-tertiary)]"
            >
              <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
              <span>Privacy Policy</span>
            </Link>
            <Link
              href="/terms"
              className="flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] p-4 transition hover:bg-[var(--bg-tertiary)]"
            >
              <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
              <span>Terms of Service</span>
            </Link>
          </div>

          {/* FAQs */}
          <div>
            <div className="mb-8 flex items-center gap-3">
              <HelpCircle className="h-6 w-6" />
              <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <details
                  key={index}
                  className="group overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between p-6">
                    <span className="pr-4 font-medium">{faq.question}</span>
                    <span className="text-2xl text-[var(--text-tertiary)] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="px-6 pb-6 text-[var(--text-secondary)]">{faq.answer}</div>
                </details>
              ))}
            </div>
          </div>

          {/* Still Need Help */}
          <div className="mt-16 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center">
            <h3 className="mb-2 text-xl font-semibold">Still need help?</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              Our support team is here to assist you with any questions or issues.
            </p>
            <a
              href="mailto:support@promptomize.app"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-6 py-3 font-medium text-[var(--bg-primary)] transition hover:opacity-90"
            >
              <Mail className="h-5 w-5" />
              Contact Support
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-4 py-8">
        <div className="mx-auto max-w-7xl text-center text-[var(--text-tertiary)]">
          <div className="mb-4 flex justify-center gap-6">
            <Link href="/privacy" className="transition hover:text-[var(--text-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-[var(--text-primary)]">
              Terms
            </Link>
            <Link href="/support" className="transition hover:text-[var(--text-primary)]">
              Support
            </Link>
          </div>
          <p>&copy; {new Date().getFullYear()} Promptomize. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
