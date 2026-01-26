'use client'

import { ThemeToggle } from '@/components/ui/theme-toggle'

export function AuthLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main
      className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4 relative"
      role="main"
      aria-label="Authentication"
    >
      {/* Theme toggle in top right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        {children}
      </div>
    </main>
  )
}
