'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { useUIStore } from '@/lib/stores/uiStore'
import { useAuthStore } from '@/lib/stores/authStore'
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/shared/logo'
import {
  Sparkles,
  History,
  FileText,
  FolderOpen,
  BarChart3,
  Settings,
  User,
  Crown,
  X,
  LogOut,
  Code2,
} from 'lucide-react'

const navigation: {
  name: string
  href: string
  icon: typeof Sparkles
  premium?: boolean
}[] = [
  { name: 'Enhance', href: '/dashboard', icon: Sparkles },
  { name: 'History', href: '/history', icon: History },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'Collections', href: '/collections', icon: FolderOpen },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Developers', href: '/developers', icon: Code2 },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Profile', href: '/profile', icon: User },
]

export function MobileNav() {
  const pathname = usePathname()
  const { mobileMenuOpen, closeMobileMenu } = useUIStore()
  const { user, logout } = useAuthStore()
  const { subscription } = useSubscriptionStore()

  const tier = subscription.tier

  // Close on route change
  useEffect(() => {
    closeMobileMenu()
  }, [pathname, closeMobileMenu])

  // Prevent scroll when open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileMenuOpen])

  if (!mobileMenuOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className="fixed inset-y-0 left-0 z-50 w-80 bg-[var(--bg-secondary)] shadow-2xl lg:hidden animate-in slide-in-from-left duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={closeMobileMenu}
            aria-label="Promptomize Dashboard"
          >
            <Logo size={40} className="rounded-xl" />
            <span className="text-lg font-bold gradient-text">Promptomize</span>
          </Link>
          <button
            onClick={closeMobileMenu}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            aria-label="Close navigation menu"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl overflow-hidden bg-brand-indigo dark:bg-brand-cyan">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={`${user.name || 'User'}'s avatar`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-white dark:text-black" aria-hidden="true">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--text-primary)] truncate">{user?.name || 'User'}</p>
            <p className="text-sm text-[var(--text-secondary)] truncate">{user?.email}</p>
          </div>
          <Badge
            variant={tier === 'PREMIUM' ? 'premium' : tier === 'PRO' ? 'pro' : 'outline'}
            aria-label={`Current tier: ${tier}`}
          >
            {tier}
          </Badge>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4" aria-label="Mobile navigation">
          <ul className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const isPremiumLocked = item.premium && tier !== 'PREMIUM'

              return (
                <li key={item.name}>
                  <Link
                    href={isPremiumLocked ? '/upgrade' : item.href}
                    onClick={closeMobileMenu}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition-all duration-200',
                      isActive
                        ? 'bg-brand-indigo text-white shadow-lg shadow-brand-indigo/25'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
                      isPremiumLocked && 'opacity-60'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon className={cn('h-5 w-5', isActive && 'text-white')} aria-hidden="true" />
                    <span className="flex-1">{item.name}</span>
                    {item.premium && (
                      <Badge variant={isPremiumLocked ? 'outline' : 'premium'} className="text-[10px]">
                        {isPremiumLocked ? 'PRO' : <Crown className="h-3 w-3" aria-hidden="true" />}
                      </Badge>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Upgrade Banner */}
          {tier === 'FREE' && (
            <Link
              href="/upgrade"
              onClick={closeMobileMenu}
              className="mt-4 block rounded-xl bg-brand-indigo/10 dark:bg-brand-cyan/10 border border-brand-indigo/20 dark:border-brand-cyan/20 p-4 hover:border-brand-indigo/40 dark:hover:border-brand-cyan/40 transition-colors"
              aria-label="Upgrade to Pro for more features"
            >
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-5 w-5 text-brand-indigo dark:text-brand-cyan" aria-hidden="true" />
                <span className="font-semibold text-[var(--text-primary)]">Upgrade to Pro</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Get 100 daily prompts, advanced features, and more
              </p>
            </Link>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--border)] p-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            onClick={() => {
              logout()
              closeMobileMenu()
            }}
            aria-label="Sign out of your account"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sign Out
          </Button>
        </div>
      </aside>
    </>
  )
}
