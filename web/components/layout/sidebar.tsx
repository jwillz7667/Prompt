'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { useUIStore } from '@/lib/stores/uiStore'
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'
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
  ChevronLeft,
} from 'lucide-react'

const navigation = [
  { name: 'Enhance', href: '/dashboard', icon: Sparkles },
  { name: 'History', href: '/history', icon: History },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'Collections', href: '/collections', icon: FolderOpen },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
]

const bottomNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Profile', href: '/profile', icon: User },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore()
  const { subscription } = useSubscriptionStore()

  const tier = subscription.tier

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r border-[var(--border)] bg-[var(--bg-secondary)] transition-all duration-300',
        sidebarCollapsed ? 'w-20' : 'w-64'
      )}
      role="navigation"
      aria-label="Main sidebar navigation"
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2"
          aria-label="Promptomize Dashboard"
        >
          <Logo size={40} className="rounded-xl" />
          {!sidebarCollapsed && (
            <span className="text-lg font-bold gradient-text">Promptomize</span>
          )}
        </Link>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          <ChevronLeft
            className={cn('h-5 w-5 transition-transform', sidebarCollapsed && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col h-[calc(100vh-4rem)] p-4" aria-label="Dashboard navigation">
        <ul className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            const isPremiumLocked = item.premium && tier !== 'PREMIUM'

            return (
              <li key={item.name}>
                <Link
                  href={isPremiumLocked ? '/upgrade' : item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-brand-indigo text-white shadow-lg shadow-brand-indigo/25'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
                    isPremiumLocked && 'opacity-60'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-white')} aria-hidden="true" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1">{item.name}</span>
                      {item.premium && (
                        <Badge variant={isPremiumLocked ? 'outline' : 'premium'} className="text-[10px]">
                          {isPremiumLocked ? 'PRO' : <Crown className="h-3 w-3" aria-hidden="true" />}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Upgrade Banner */}
        {!sidebarCollapsed && tier === 'FREE' && (
          <Link
            href="/upgrade"
            className="mb-4 rounded-xl bg-brand-indigo/10 dark:bg-brand-cyan/10 border border-brand-indigo/20 dark:border-brand-cyan/20 p-4 hover:border-brand-indigo/40 dark:hover:border-brand-cyan/40 transition-colors"
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

        {/* Bottom Navigation */}
        <ul className="space-y-1 border-t border-[var(--border)] pt-4">
          {bottomNavigation.map((item) => {
            const isActive = pathname === item.href

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-brand-indigo text-white shadow-lg shadow-brand-indigo/25'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-white')} aria-hidden="true" />
                  {!sidebarCollapsed && <span>{item.name}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
