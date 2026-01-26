import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Terms of Service - Promptomize',
  description: 'Terms of Service for Promptomize. Read our terms for using the AI-powered prompt enhancement app, subscription plans, and user guidelines.',
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

      <article className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto prose prose-lg dark:prose-invert">
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-[var(--text-secondary)] mb-8">Last updated: January 20, 2025</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-[var(--text-secondary)]">
              By downloading, installing, or using Promptomize (&quot;the App&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the App.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-[var(--text-secondary)] mb-4">
              Promptomize is an AI-powered application that helps users enhance and optimize their prompts for use with artificial intelligence systems. The App provides:
            </p>
            <ul className="list-disc list-inside text-[var(--text-secondary)] space-y-2">
              <li>Prompt enhancement and optimization</li>
              <li>Prompt history storage</li>
              <li>Multiple subscription tiers with varying features</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Account Registration</h2>
            <p className="text-[var(--text-secondary)] mb-4">
              To use certain features of the App, you must create an account using Sign in with Apple. You agree to:
            </p>
            <ul className="list-disc list-inside text-[var(--text-secondary)] space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized use</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Subscriptions and Payments</h2>

            <h3 className="text-xl font-medium mb-3">4.1 Subscription Plans</h3>
            <p className="text-[var(--text-secondary)] mb-4">
              Promptomize offers the following subscription tiers:
            </p>
            <ul className="list-disc list-inside text-[var(--text-secondary)] mb-4 space-y-2">
              <li><strong>Free:</strong> 10 prompts per day, basic quality</li>
              <li><strong>Pro ($4.99/month or $49.99/year):</strong> 100 prompts per day, standard quality</li>
              <li><strong>Premium ($9.99/month or $99.99/year):</strong> Unlimited prompts, advanced quality</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.2 Free Trial</h3>
            <p className="text-[var(--text-secondary)] mb-4">
              Premium subscriptions include a 7-day free trial. You will not be charged during the trial period. If you do not cancel before the trial ends, your subscription will automatically convert to a paid subscription.
            </p>

            <h3 className="text-xl font-medium mb-3">4.3 Billing</h3>
            <p className="text-[var(--text-secondary)] mb-4">
              All payments are processed through Apple&apos;s App Store. By subscribing, you agree to Apple&apos;s terms of service for in-app purchases. Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.
            </p>

            <h3 className="text-xl font-medium mb-3">4.4 Refunds</h3>
            <p className="text-[var(--text-secondary)]">
              Refunds are handled by Apple according to their refund policy. To request a refund, contact Apple Support directly.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Acceptable Use</h2>
            <p className="text-[var(--text-secondary)] mb-4">
              You agree not to use the App to:
            </p>
            <ul className="list-disc list-inside text-[var(--text-secondary)] space-y-2">
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
            <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property</h2>

            <h3 className="text-xl font-medium mb-3">6.1 Our Content</h3>
            <p className="text-[var(--text-secondary)] mb-4">
              The App, including its design, features, and content, is owned by Promptomize and protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h3 className="text-xl font-medium mb-3">6.2 Your Content</h3>
            <p className="text-[var(--text-secondary)]">
              You retain ownership of the prompts you create. By using the App, you grant us a limited license to process your prompts for the purpose of providing the service. Enhanced prompts generated by the App are yours to use as you see fit.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Disclaimer of Warranties</h2>
            <p className="text-[var(--text-secondary)]">
              THE APP IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. THE QUALITY OF ENHANCED PROMPTS MAY VARY AND IS NOT GUARANTEED TO MEET YOUR SPECIFIC NEEDS.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p className="text-[var(--text-secondary)]">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROMPTOMIZE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE APP.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Indemnification</h2>
            <p className="text-[var(--text-secondary)]">
              You agree to indemnify and hold harmless Promptomize and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including attorneys&apos; fees) arising out of your use of the App or violation of these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Termination</h2>
            <p className="text-[var(--text-secondary)]">
              We may terminate or suspend your account and access to the App at any time, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties, or for any other reason. Upon termination, your right to use the App will immediately cease.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Changes to Terms</h2>
            <p className="text-[var(--text-secondary)]">
              We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting the new Terms in the App or on our website. Your continued use of the App after such modifications constitutes your acceptance of the updated Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Governing Law</h2>
            <p className="text-[var(--text-secondary)]">
              These Terms shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Contact Information</h2>
            <p className="text-[var(--text-secondary)]">
              If you have any questions about these Terms, please contact us:
            </p>
            <ul className="list-disc list-inside text-[var(--text-secondary)] mt-4 space-y-2">
              <li>Email: legal@promptomize.app</li>
              <li>Website: <Link href="https://promptomize.app/support" className="text-[var(--accent-cyan)] hover:underline">https://promptomize.app/support</Link></li>
            </ul>
          </section>
        </div>
      </article>

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
