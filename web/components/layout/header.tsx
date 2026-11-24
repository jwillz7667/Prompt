'use client'

import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/authStore'
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'
import { useUIStore } from '@/lib/stores/uiStore'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Logo } from '@/components/shared/logo'
import { Menu, Bell, Crown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export function Header() {
  const { user } = useAuthStore()
  const { subscription, isEntitled, hasLoaded } = useSubscriptionStore()
  const { toggleMobileMenu, sidebarCollapsed } = useUIStore()

  return (
    <header
      className={cn(
        'bg-[var(--bg-secondary)]/80 fixed right-0 top-0 z-30 h-16 border-b border-[var(--border)] backdrop-blur-lg transition-all duration-300',
        sidebarCollapsed ? 'left-20' : 'left-64',
        'max-lg:left-0',
      )}
      role="banner"
    >
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        {/* Mobile menu button */}
        <button
          onClick={toggleMobileMenu}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] lg:hidden"
          aria-label="Open navigation menu"
          aria-expanded="false"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>

        {/* Mobile Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 lg:hidden"
          aria-label="Promptomize Dashboard"
        >
          <Logo size={32} className="rounded-lg" />
        </Link>

        {/* Desktop spacer */}
        <div className="hidden lg:block" />

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Plan badge */}
          {isEntitled ? (
            <Badge variant="premium" aria-label="Current plan: Premium">
              <Crown className="mr-1 h-3 w-3" aria-hidden="true" />
              {subscription.isTrialing ? 'Premium trial' : 'Premium'}
            </Badge>
          ) : (
            hasLoaded && (
              <Link href="/upgrade" aria-label="Start your Premium free trial">
                <Badge variant="outline">Start free trial</Badge>
              </Link>
            )
          )}

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <button
            className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            aria-label="View notifications"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-cyan"
              aria-label="New notifications available"
            />
          </button>

          {/* Profile */}
          <Link
            href="/profile"
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-brand-indigo dark:bg-brand-cyan"
            aria-label={`Profile for ${user?.name || user?.email || 'User'}`}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={`${user.name || 'User'}'s avatar`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-white dark:text-black" aria-hidden="true">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}
