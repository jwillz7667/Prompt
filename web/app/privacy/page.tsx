import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Privacy Policy - Promptomize',
  description:
    'Privacy Policy for Promptomize. Learn how we collect, use, and protect your data. Your prompts are processed securely and never shared for advertising.',
  keywords: ['promptomize privacy', 'AI prompt privacy', 'data protection', 'prompt security'],
  openGraph: {
    title: 'Privacy Policy - Promptomize',
    description: 'Learn how Promptomize protects your data and privacy.',
    url: 'https://promptomize.app/privacy',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy - Promptomize',
    description: 'Learn how Promptomize protects your data and privacy.',
  },
  alternates: {
    canonical: '/privacy',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PrivacyPolicy() {
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
          <h1 className="mb-2 text-4xl font-bold">Privacy Policy</h1>
          <p className="mb-8 text-[var(--text-secondary)]">Last updated: January 20, 2025</p>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Introduction</h2>
            <p className="mb-4 text-[var(--text-secondary)]">
              Promptomize (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to
              protecting your privacy. This Privacy Policy explains how we collect, use, disclose,
              and safeguard your information when you use our mobile application Promptomize (the
              &quot;App&quot;).
            </p>
            <p className="text-[var(--text-secondary)]">
              Please read this Privacy Policy carefully. By using the App, you agree to the
              collection and use of information in accordance with this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Information We Collect</h2>

            <h3 className="mb-3 text-xl font-medium">Personal Information</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              When you create an account or use Sign in with Apple, we may collect:
            </p>
            <ul className="mb-4 list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Email address (if provided through Sign in with Apple)</li>
              <li>Name (if provided through Sign in with Apple)</li>
              <li>Unique user identifier</li>
            </ul>

            <h3 className="mb-3 text-xl font-medium">Usage Information</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              We automatically collect certain information when you use the App:
            </p>
            <ul className="mb-4 list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Prompt history (stored securely for your convenience)</li>
              <li>App usage statistics (number of prompts enhanced)</li>
              <li>Device information (device type, operating system version)</li>
              <li>Subscription status</li>
            </ul>

            <h3 className="mb-3 text-xl font-medium">Prompt Content</h3>
            <p className="text-[var(--text-secondary)]">
              When you use Promptomize to enhance prompts, your prompt content is:
            </p>
            <ul className="mb-4 list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Processed through our AI service to generate enhanced versions</li>
              <li>Stored in your prompt history if you choose to save it</li>
              <li>Not shared with third parties for advertising purposes</li>
              <li>Not used to train AI models without your explicit consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">How We Use Your Information</h2>
            <p className="mb-4 text-[var(--text-secondary)]">
              We use the information we collect to:
            </p>
            <ul className="list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Provide, maintain, and improve the App</li>
              <li>Process and enhance your prompts</li>
              <li>Manage your account and subscription</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Analyze usage patterns to improve our services</li>
              <li>Detect, prevent, and address technical issues</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Data Storage and Security</h2>
            <p className="mb-4 text-[var(--text-secondary)]">
              We implement appropriate technical and organizational security measures to protect
              your personal information:
            </p>
            <ul className="list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>All data is encrypted in transit using TLS/SSL</li>
              <li>Data at rest is encrypted using industry-standard encryption</li>
              <li>Access to personal data is restricted to authorized personnel</li>
              <li>We regularly review and update our security practices</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Third-Party Services</h2>
            <p className="mb-4 text-[var(--text-secondary)]">
              We use the following third-party services:
            </p>
            <ul className="list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>
                <strong>Apple Sign In:</strong> For authentication
              </li>
              <li>
                <strong>Apple App Store:</strong> For subscription processing
              </li>
              <li>
                <strong>AI Processing Services:</strong> For prompt enhancement processing
              </li>
              <li>
                <strong>Railway:</strong> For backend infrastructure hosting
              </li>
            </ul>
            <p className="mt-4 text-[var(--text-secondary)]">
              Each of these services has their own privacy policies governing their use of data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Data Retention</h2>
            <p className="text-[var(--text-secondary)]">
              We retain your personal information for as long as your account is active or as needed
              to provide you services. You can request deletion of your account and associated data
              at any time through the App settings. We will delete your data within 30 days of
              receiving a deletion request, except where we are required to retain it for legal or
              legitimate business purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Your Rights</h2>
            <p className="mb-4 text-[var(--text-secondary)]">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>
                <strong>Access:</strong> Request access to your personal data
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate data
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your data
              </li>
              <li>
                <strong>Portability:</strong> Request a copy of your data in a portable format
              </li>
              <li>
                <strong>Objection:</strong> Object to processing of your data
              </li>
            </ul>
            <p className="mt-4 text-[var(--text-secondary)]">
              To exercise these rights, please contact us at privacy@promptomize.app.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Children&apos;s Privacy</h2>
            <p className="text-[var(--text-secondary)]">
              The App is not intended for use by children under 13 years of age. We do not knowingly
              collect personal information from children under 13. If we learn we have collected
              personal information from a child under 13, we will delete that information as quickly
              as possible.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Changes to This Privacy Policy</h2>
            <p className="text-[var(--text-secondary)]">
              We may update our Privacy Policy from time to time. We will notify you of any changes
              by posting the new Privacy Policy on this page and updating the &quot;Last
              updated&quot; date. You are advised to review this Privacy Policy periodically for any
              changes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold">Contact Us</h2>
            <p className="text-[var(--text-secondary)]">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-[var(--text-secondary)]">
              <li>Email: privacy@promptomize.app</li>
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
