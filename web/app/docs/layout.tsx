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
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-primary/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xl font-bold text-primary">
                Promptomize
              </Link>
              <span className="text-muted">|</span>
              <span className="text-primary font-medium">Documentation</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/developers"
                className="text-sm text-muted hover:text-primary transition-colors"
              >
                Developer Portal
              </Link>
              <a
                href="/api/v1/docs/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted hover:text-primary transition-colors"
              >
                OpenAPI Spec
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <nav className="sticky top-24 space-y-6">
              {docsSections.map((section) => (
                <div key={section.title}>
                  <h3 className="font-semibold text-primary text-sm mb-2">{section.title}</h3>
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              'block px-3 py-1.5 text-sm rounded transition-colors',
                              isActive
                                ? 'bg-accent/10 text-accent font-medium'
                                : 'text-muted hover:text-primary hover:bg-secondary'
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
          <main className="flex-1 min-w-0">
            <article className="prose prose-invert max-w-none">{children}</article>
          </main>
        </div>
      </div>
    </div>
  )
}
