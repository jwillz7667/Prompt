'use client'

import { ThemeToggle } from '@/components/ui/theme-toggle'

export function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-4"
      role="main"
      aria-label="Authentication"
    >
      {/* Theme toggle in top right */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}
