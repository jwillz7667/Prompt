'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { useDeveloperAuthStore } from '@/lib/stores/developerAuthStore'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Code2, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'

const developerNavItems = [
  { href: '/developers', label: 'Overview', icon: '🏠' },
  { href: '/developers/keys', label: 'API Keys', icon: '🔑' },
  { href: '/developers/usage', label: 'Usage', icon: '📊' },
  { href: '/developers/billing', label: 'Billing', icon: '💳' },
  { href: '/developers/playground', label: 'Playground', icon: '🎮' },
]

function DeveloperPortalContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { developer, subscription, isAuthenticated, isLoading, checkAuth, logout } =
    useDeveloperAuthStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/developers/login')
    }
  }, [isLoading, isAuthenticated, router])

  // Show loading state while checking auth
  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-indigo mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">Loading developer portal...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[var(--border)] bg-[var(--bg-secondary)]/90 backdrop-blur-lg">
        <div className="h-full px-4 lg:px-6 flex items-center justify-between">
          {/* Left side - Logo and Nav */}
          <div className="flex items-center gap-6">
            <Link href="/developers" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo">
                <Code2 className="h-5 w-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <span className="text-sm font-bold gradient-text">Promptomize</span>
                <span className="text-xs text-[var(--text-tertiary)] block">Developer Portal</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {developerNavItems.map((item) => {
                const isActive =
                  item.href === '/developers'
                    ? pathname === '/developers'
                    : pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-indigo/10 text-brand-indigo'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right side - User info and actions */}
          <div className="flex items-center gap-3">
            {/* Subscription badge */}
            {subscription && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)]">
                <span className="text-xs text-[var(--text-secondary)]">
                  {subscription.currentPeriodUsage}/{subscription.includedRequests} requests
                </span>
              </div>
            )}

            <ThemeToggle />

            {/* User menu */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {developer?.name || developer?.email}
                </p>
                {developer?.company && (
                  <p className="text-xs text-[var(--text-tertiary)]">{developer.company}</p>
                )}
              </div>
              <button
                onClick={logout}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-red-500"
                title="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[var(--border)] bg-[var(--bg-secondary)]">
            <nav className="flex flex-col p-2">
              {developerNavItems.map((item) => {
                const isActive =
                  item.href === '/developers'
                    ? pathname === '/developers'
                    : pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-indigo/10 text-brand-indigo'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    )}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="pt-16">
        <div className="min-h-[calc(100vh-4rem)]">{children}</div>
      </main>
    </div>
  )
}

export default function DevelopersPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-indigo" />
        </div>
      }
    >
      <DeveloperPortalContent>{children}</DeveloperPortalContent>
    </Suspense>
  )
}
