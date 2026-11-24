import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Terms of Service - Promptomize',
  description:
    'Terms of Service for Promptomize. Read our terms for using the AI-powered prompt enhancement app, subscription plans, and user guidelines.',
  keywords: [
    'promptomize terms',
    'AI prompt terms of service',
    'user agreement',
    'subscription terms',
  ],
  openGraph: {
    title: 'Terms of Service - Promptomize',
    description: 'Read the Terms of Service for Promptomize.',
    url: 'https://promptomize.app/terms',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Terms of Service - Promptomize',
    description: 'Read the Terms of Service for Promptomize.',
  },
  alternates: {
    canonical: '/terms',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function TermsOfService() {
  return (
    <main className="min-h-screen">
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

      <article className="px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert mx-auto max-w-3xl">
          <h1 className="mb-2 text-4xl font-bold">Terms of Service</h1>
          <p className="mb-8 text-[var(--text-secondary)]">Last updated: November 24, 2026</p>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">1. Acceptance of Terms</h2>
            <p className="text-[var(--text-secondary)]">
              By downloading, installing, or using Promptomize (&quot;the App&quot;), you agree to
              be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these
              Terms, do not use the App.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">2. Description of Service</h2>
            <p className="mb-4 text-[var(--text-secondary)]">
              Promptomize is an AI-powered application that helps users enhance and optimize their
              prompts for use with artificial intelligence systems. The App provides:
            </p>
            <ul className="list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Prompt enhancement and optimization</li>
              <li>Prompt history storage</li>
              <li>Multiple subscription tiers with varying features</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">3. Account Registration</h2>
            <p className="mb-4 text-[var(--text-secondary)]">
              To use certain features of the App, you must create an account using Sign in with
              Apple. You agree to:
            </p>
            <ul className="list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized use</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">4. Subscriptions and Payments</h2>

            <h3 className="mb-3 text-xl font-medium">4.1 Subscription Plan</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              Promptomize is offered as a single subscription, <strong>Promptomize Premium</strong>,
              at $9.99 per month (or the local equivalent shown at purchase). Premium includes the
              prompt optimizer, the AI chat assistant and sync between the web and iOS apps, subject
              to fair-use limits that prevent abuse. There is no free plan; generating content
              requires an active subscription.
            </p>

            <h3 className="mb-3 text-xl font-medium">4.2 Free Trial</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              New subscribers receive a 3-day free trial, limited to one trial per account across
              the web and the App Store. A payment method is required to start the trial. You will
              not be charged during the trial period. If you do not cancel before the trial ends,
              your subscription automatically converts to a paid subscription at $9.99 per month.
            </p>

            <h3 className="mb-3 text-xl font-medium">4.3 Billing and Renewal</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              Subscriptions purchased in the iOS app are billed by Apple through the App Store, and
              Apple&apos;s terms for in-app purchases apply; they renew automatically unless
              canceled at least 24 hours before the end of the current period, in Settings &gt;
              Apple Account &gt; Subscriptions. Subscriptions purchased on promptomize.app are
              billed by our payment processor, Stripe; they renew automatically each month until
              canceled, and you can cancel at any time from Manage subscription on the upgrade page.
              In both cases you keep access until the end of the period you have paid for.
            </p>

            <h3 className="mb-3 text-xl font-medium">4.4 Refunds</h3>
            <p className="text-[var(--text-secondary)]">
              Refunds for App Store purchases are handled by Apple according to its refund policy;
              request one at reportaproblem.apple.com. For subscriptions purchased on
              promptomize.app, contact us within 30 days of your first paid charge to request a
              refund.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">5. Acceptable Use</h2>
            <p className="mb-4 text-[var(--text-secondary)]">You agree not to use the App to:</p>
            <ul className="list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Generate content that is illegal, harmful, threatening, abusive, or harassing</li>
              <li>Create content that infringes on intellectual property rights</li>
              <li>Generate spam, phishing content, or malware</li>
              <li>Attempt to bypass usage limits or security measures</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Use automated systems to access the service</li>
              <li>Resell or redistribute the service without authorization</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">6. Intellectual Property</h2>

            <h3 className="mb-3 text-xl font-medium">6.1 Our Content</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              The App, including its design, features, and content, is owned by Promptomize and
              protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h3 className="mb-3 text-xl font-medium">6.2 Your Content</h3>
            <p className="text-[var(--text-secondary)]">
              You retain ownership of the prompts you create. By using the App, you grant us a
              limited license to process your prompts for the purpose of providing the service.
              Enhanced prompts generated by the App are yours to use as you see fit.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">7. Disclaimer of Warranties</h2>
            <p className="text-[var(--text-secondary)]">
              THE APP IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
              OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE APP WILL BE
              UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. THE QUALITY
              OF ENHANCED PROMPTS MAY VARY AND IS NOT GUARANTEED TO MEET YOUR SPECIFIC NEEDS.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">8. Limitation of Liability</h2>
            <p className="text-[var(--text-secondary)]">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROMPTOMIZE SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
              PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA,
              USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE APP.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">9. Indemnification</h2>
            <p className="text-[var(--text-secondary)]">
              You agree to indemnify and hold harmless Promptomize and its officers, directors,
              employees, and agents from any claims, damages, losses, liabilities, and expenses
              (including attorneys&apos; fees) arising out of your use of the App or violation of
              these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">10. Termination</h2>
            <p className="text-[var(--text-secondary)]">
              We may terminate or suspend your account and access to the App at any time, without
              prior notice, for conduct that we believe violates these Terms or is harmful to other
              users, us, or third parties, or for any other reason. Upon termination, your right to
              use the App will immediately cease.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">11. Changes to Terms</h2>
            <p className="text-[var(--text-secondary)]">
              We reserve the right to modify these Terms at any time. We will notify you of any
              material changes by posting the new Terms in the App or on our website. Your continued
              use of the App after such modifications constitutes your acceptance of the updated
              Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">12. Governing Law</h2>
            <p className="text-[var(--text-secondary)]">
              These Terms shall be governed by and construed in accordance with the laws of the
              State of California, United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">13. Contact Information</h2>
            <p className="text-[var(--text-secondary)]">
              If you have any questions about these Terms, please contact us:
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Email: legal@promptomize.app</li>
              <li>
                Website:{' '}
                <Link
                  href="https://promptomize.app/support"
                  className="text-[var(--accent-cyan)] hover:underline"
                >
                  https://promptomize.app/support
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </article>

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
