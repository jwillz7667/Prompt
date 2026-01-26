'use client'

import Link from 'next/link'
import { WifiOff, RefreshCw, Home } from 'lucide-react'

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center">
          <WifiOff className="w-10 h-10 text-[var(--text-tertiary)]" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          You're Offline
        </h1>

        <p className="text-[var(--text-secondary)] mb-8">
          It looks like you've lost your internet connection. Some features may not be available until you're back online.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--brand-accent)] text-[var(--text-on-accent)] rounded-xl font-medium hover:opacity-90 transition"
            aria-label="Try to reconnect"
          >
            <RefreshCw className="w-5 h-5" aria-hidden="true" />
            Try Again
          </button>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-xl font-medium hover:bg-[var(--bg-tertiary)] transition border border-[var(--border)]"
          >
            <Home className="w-5 h-5" aria-hidden="true" />
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
