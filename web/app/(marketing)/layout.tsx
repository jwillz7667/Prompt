'use client'

import Link from 'next/link'
import { Zap, Twitter, Github } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo dark:bg-brand-cyan">
                <Zap className="h-5 w-5 text-white dark:text-black" />
              </div>
              <span className="text-lg font-bold gradient-text">Promptomize</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link
                href="/pricing"
                className="hidden sm:block text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                className="hidden sm:block text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                API Docs
              </Link>
              <Link
                href="/support"
                className="hidden sm:block text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Support
              </Link>
              <Link
                href="/login"
                className="hidden sm:block text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Sign In
              </Link>
              <ThemeToggle />
              <Link
                href="/login"
                className="btn-cyan px-4 py-2 rounded-xl text-sm font-medium"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 pt-16">{children}</main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="col-span-1">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo dark:bg-brand-cyan">
                  <Zap className="h-5 w-5 text-white dark:text-black" />
                </div>
                <span className="text-lg font-bold gradient-text">Promptomize</span>
              </Link>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Transform your AI prompts into powerful, optimized instructions.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold text-[var(--text-primary)] mb-4">Product</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/pricing"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="https://apps.apple.com/app/promptomize/id6738850382"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    iOS App
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Web App
                  </Link>
                </li>
              </ul>
            </div>

            {/* Developers */}
            <div>
              <h4 className="font-semibold text-[var(--text-primary)] mb-4">Developers</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/docs"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    API Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    href="/developers/signup"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Developer Signup
                  </Link>
                </li>
                <li>
                  <Link
                    href="/developers/login"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Developer Login
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-[var(--text-primary)] mb-4">Legal</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-semibold text-[var(--text-primary)] mb-4">Support</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/support"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Help Center
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:support@promptomize.app"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[var(--text-tertiary)]">
              &copy; {new Date().getFullYear()} Promptomize. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://twitter.com/promptomize"
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://github.com/promptomize"
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
