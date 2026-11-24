'use client'

import Link from 'next/link'
import { Zap, Twitter, Github } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <nav className="glass fixed left-0 right-0 top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo dark:bg-brand-cyan">
                <Zap className="h-5 w-5 text-white dark:text-black" />
              </div>
              <span className="gradient-text text-lg font-bold">Promptomize</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link
                href="/demo"
                className="hidden text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:block"
              >
                Demo
              </Link>
              <Link
                href="/pricing"
                className="hidden text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:block"
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                className="hidden text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:block"
              >
                API Docs
              </Link>
              <Link
                href="/developers"
                className="hidden text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:block"
              >
                Developers
              </Link>
              <Link
                href="/support"
                className="hidden text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:block"
              >
                Support
              </Link>
              <Link
                href="/login"
                className="hidden text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:block"
              >
                Sign In
              </Link>
              <ThemeToggle />
              <Link href="/login" className="btn-cyan rounded-xl px-4 py-2 text-sm font-medium">
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
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="col-span-1">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo dark:bg-brand-cyan">
                  <Zap className="h-5 w-5 text-white dark:text-black" />
                </div>
                <span className="gradient-text text-lg font-bold">Promptomize</span>
              </Link>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Transform your AI prompts into powerful, optimized instructions.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="mb-4 font-semibold text-[var(--text-primary)]">Product</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/demo"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Demo
                  </Link>
                </li>
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
                    href="https://apps.apple.com/us/app/promptomize/id6758075605"
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
              <h4 className="mb-4 font-semibold text-[var(--text-primary)]">Developers</h4>
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
              <h4 className="mb-4 font-semibold text-[var(--text-primary)]">Legal</h4>
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
              <h4 className="mb-4 font-semibold text-[var(--text-primary)]">Support</h4>
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

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] pt-8 sm:flex-row">
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
