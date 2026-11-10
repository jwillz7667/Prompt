'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

const docsSections = [
  {
    title: 'Getting Started',
    items: [
      { href: '/docs', label: 'Quick Start' },
      { href: '/docs/authentication', label: 'Authentication' },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { href: '/docs/api-reference', label: 'Overview' },
      { href: '/docs/api-reference/enhance', label: 'Enhance Endpoint' },
      { href: '/docs/api-reference/usage', label: 'Usage Endpoint' },
      { href: '/docs/api-reference/models', label: 'Models Endpoint' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { href: '/docs/rate-limits', label: 'Rate Limits' },
      { href: '/docs/errors', label: 'Error Handling' },
      { href: '/docs/sdks', label: 'SDKs & Examples' },
    ],
  },
]

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="bg-primary min-h-screen">
      {/* Header */}
      <header className="border-border bg-primary/95 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-primary text-xl font-bold">
                Promptomize
              </Link>
              <span className="text-muted">|</span>
              <span className="text-primary font-medium">Documentation</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/developers"
                className="text-muted hover:text-primary text-sm transition-colors"
              >
                Developer Portal
              </Link>
              <a
                href="/api/v1/docs/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-primary text-sm transition-colors"
              >
                OpenAPI Spec
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <nav className="sticky top-24 space-y-6">
              {docsSections.map((section) => (
                <div key={section.title}>
                  <h3 className="text-primary mb-2 text-sm font-semibold">{section.title}</h3>
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              'block rounded px-3 py-1.5 text-sm transition-colors',
                              isActive
                                ? 'bg-accent/10 text-accent font-medium'
                                : 'text-muted hover:text-primary hover:bg-secondary',
                            )}
                          >
                            {item.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="min-w-0 flex-1">
            <article className="prose prose-invert max-w-none">{children}</article>
          </main>
        </div>
      </div>
    </div>
  )
}
