import Link from 'next/link'
import { LinkIcon, Zap } from 'lucide-react'

export default function SharedPromptNotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-indigo dark:bg-brand-cyan">
              <Zap className="h-4 w-4 text-white dark:text-black" />
            </div>
            <span className="text-lg font-bold gradient-text">Promptomize</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <LinkIcon className="h-6 w-6 text-[var(--text-tertiary)]" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
            This link is no longer available
          </h1>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            The shared prompt you&apos;re looking for may have been removed or
            the link has expired.
          </p>
          <Link
            href="/"
            className="btn-cyan mt-8 inline-flex items-center rounded-xl px-6 py-3 text-sm font-medium"
          >
            Go to Promptomize
          </Link>
        </div>
      </main>
    </div>
  )
}
