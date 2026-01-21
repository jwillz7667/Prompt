import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, MessageCircle, FileText, HelpCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Support - Promptomize',
  description: 'Get help and support for Promptomize - AI-Powered Prompt Enhancement App',
}

const faqs = [
  {
    question: 'How does Promptomize enhance my prompts?',
    answer: 'Promptomize uses advanced prompt engineering techniques to transform your simple ideas into detailed, structured prompts. It applies methods like chain-of-thought reasoning, role assignment, and constraint engineering to help you get better results from AI systems.',
  },
  {
    question: 'What is the difference between prompt quality tiers?',
    answer: 'Basic prompts (Free tier) include essential structuring and clarity improvements. Standard prompts (Pro tier) add techniques like RISEN framework and few-shot examples. Advanced prompts (Premium tier) include all techniques including tree-of-thought, meta-cognitive triggers, and instruction hierarchy.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer: 'You can cancel your subscription through your Apple ID settings: Go to Settings > [Your Name] > Subscriptions > Promptomize > Cancel Subscription. Your subscription will remain active until the end of the current billing period.',
  },
  {
    question: 'Can I get a refund?',
    answer: 'Refunds are handled by Apple. To request a refund, visit reportaproblem.apple.com, sign in with your Apple ID, and select the purchase you want to request a refund for.',
  },
  {
    question: 'How do I restore my purchases on a new device?',
    answer: 'Open Promptomize on your new device, go to Profile > Subscription, and tap "Restore Purchases". Make sure you are signed in with the same Apple ID you used to make the original purchase.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes, we take security seriously. All data is encrypted in transit and at rest. We never share your prompts with third parties for advertising purposes, and you can delete your data at any time through the app settings.',
  },
  {
    question: 'What happens when I reach my daily prompt limit?',
    answer: 'When you reach your daily limit, you will see a message indicating that you have used all your prompts for the day. Your limit resets at midnight UTC. You can upgrade your plan for higher limits or wait until the next day.',
  },
  {
    question: 'Can I use Promptomize offline?',
    answer: 'Promptomize requires an internet connection to enhance prompts since the AI processing happens on our servers. However, you can view your saved prompt history while offline.',
  },
]

export default function Support() {
  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
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

      <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold mb-4">How can we help?</h1>
            <p className="text-xl text-[var(--text-secondary)]">
              Find answers to common questions or get in touch with our support team.
            </p>
          </div>

          {/* Contact Options */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            <a
              href="mailto:support@promptomize.app"
              className="feature-card bg-[var(--bg-secondary)] p-6 rounded-2xl border border-[var(--border)] flex items-start gap-4"
            >
              <div className="w-12 h-12 bg-[var(--bg-tertiary)] rounded-xl flex items-center justify-center flex-shrink-0">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Email Support</h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  support@promptomize.app
                </p>
                <p className="text-[var(--text-tertiary)] text-sm mt-1">
                  We typically respond within 24 hours
                </p>
              </div>
            </a>

            <div className="feature-card bg-[var(--bg-secondary)] p-6 rounded-2xl border border-[var(--border)] flex items-start gap-4">
              <div className="w-12 h-12 bg-[var(--bg-tertiary)] rounded-xl flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">In-App Feedback</h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  Go to Profile &gt; Help &amp; Support
                </p>
                <p className="text-[var(--text-tertiary)] text-sm mt-1">
                  Send feedback directly from the app
                </p>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid sm:grid-cols-2 gap-4 mb-16">
            <Link
              href="/privacy"
              className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition"
            >
              <FileText className="w-5 h-5 text-[var(--text-secondary)]" />
              <span>Privacy Policy</span>
            </Link>
            <Link
              href="/terms"
              className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition"
            >
              <FileText className="w-5 h-5 text-[var(--text-secondary)]" />
              <span>Terms of Service</span>
            </Link>
          </div>

          {/* FAQs */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <HelpCircle className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <details
                  key={index}
                  className="group bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] overflow-hidden"
                >
                  <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                    <span className="font-medium pr-4">{faq.question}</span>
                    <span className="text-2xl text-[var(--text-tertiary)] group-open:rotate-45 transition-transform">
                      +
                    </span>
                  </summary>
                  <div className="px-6 pb-6 text-[var(--text-secondary)]">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>

          {/* Still Need Help */}
          <div className="mt-16 text-center p-8 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)]">
            <h3 className="text-xl font-semibold mb-2">Still need help?</h3>
            <p className="text-[var(--text-secondary)] mb-4">
              Our support team is here to assist you with any questions or issues.
            </p>
            <a
              href="mailto:support@promptomize.app"
              className="inline-flex items-center gap-2 bg-[var(--text-primary)] text-[var(--bg-primary)] px-6 py-3 rounded-xl font-medium hover:opacity-90 transition"
            >
              <Mail className="w-5 h-5" />
              Contact Support
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto text-center text-[var(--text-tertiary)]">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/privacy" className="hover:text-[var(--text-primary)] transition">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)] transition">Terms</Link>
            <Link href="/support" className="hover:text-[var(--text-primary)] transition">Support</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} Promptomize. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
