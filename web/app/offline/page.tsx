'use client'

import Link from 'next/link'
import { WifiOff, RefreshCw, Home } from 'lucide-react'

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
          <WifiOff className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden="true" />
        </div>

        <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">You're Offline</h1>

        <p className="mb-8 text-[var(--text-secondary)]">
          It looks like you've lost your internet connection. Some features may not be available
          until you're back online.
        </p>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-accent)] px-6 py-3 font-medium text-[var(--text-on-accent)] transition hover:opacity-90"
            aria-label="Try to reconnect"
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Try Again
          </button>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3 font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-tertiary)]"
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            Go Home
          </Link>
        </div>

        <p className="mt-8 text-sm text-[var(--text-tertiary)]">
          Your saved prompts and history are still available offline.
        </p>
      </div>
    </main>
  )
}
