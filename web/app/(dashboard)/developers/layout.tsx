'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

const developerNavItems = [
  { href: '/developers', label: 'Overview', icon: '🏠' },
  { href: '/developers/keys', label: 'API Keys', icon: '🔑' },
  { href: '/developers/security', label: 'Security', icon: '🛡️' },
  { href: '/developers/usage', label: 'Usage', icon: '📊' },
  { href: '/developers/billing', label: 'Billing', icon: '💳' },
  { href: '/developers/playground', label: 'Playground', icon: '🎮' },
]

export default function DevelopersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Page Header */}
      <div className="border-b border-border bg-secondary/30">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛠️</span>
            <div>
              <h1 className="text-2xl font-bold text-primary">Developer Portal</h1>
              <p className="text-sm text-muted">
                Manage API keys, monitor usage, and integrate Promptomize into your applications.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Developer navigation">
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
                    'flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:border-border hover:text-primary'
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Page Content */}
      <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  )
}
