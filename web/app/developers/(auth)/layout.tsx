'use client'

import Link from 'next/link'
import { Code2 } from 'lucide-react'

export default function DeveloperAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <header className="text-center">
          <Link href="/" className="mb-4 inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-indigo">
              <Code2 className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <span className="gradient-text block text-lg font-bold">Promptomize</span>
              <span className="text-xs text-[var(--text-secondary)]">Developer Portal</span>
            </div>
          </Link>
        </header>

        {/* Content */}
        {children}

        {/* Footer */}
        <footer className="text-center text-sm text-[var(--text-tertiary)]">
          <p>
            Looking for the regular app?{' '}
            <Link href="/login" className="text-brand-indigo hover:underline">
              Sign in here
            </Link>
          </p>
        </footer>
      </div>
    </div>
  )
}
