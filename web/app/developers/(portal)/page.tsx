'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useApiSubscriptionStatus, useApiKeys } from '@/lib/hooks/useApiKeys'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function DevelopersOverviewPage() {
  const { data: subscription, isLoading: subLoading } = useApiSubscriptionStatus()
  const { data: apiKeys, isLoading: keysLoading } = useApiKeys()
  const [copied, setCopied] = useState(false)

  const curlExample = `curl -X POST https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Write a professional email", "modality": "text"}'`

  const copyExample = () => {
    navigator.clipboard.writeText(curlExample)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-8">
      {/* Quick Start Guide */}
      <div>
        <h2 className="text-xl font-semibold text-primary mb-4">Quick Start</h2>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <ol className="space-y-6">
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent font-bold">
                  1
                </span>
                <div className="flex-1">
                  <h3 className="font-medium text-primary">Get your API key</h3>
                  <p className="text-sm text-muted mt-1">
                    Create an API key to authenticate your requests.
                  </p>
                  <Link href="/developers/keys">
                    <Button className="mt-3" size="sm">
                      {apiKeys && apiKeys.length > 0 ? 'Manage Keys' : 'Create API Key'}
                    </Button>
                  </Link>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent font-bold">
                  2
                </span>
                <div className="flex-1">
                  <h3 className="font-medium text-primary">Make your first request</h3>
                  <p className="text-sm text-muted mt-1">
                    Use the /enhance endpoint to optimize prompts.
                  </p>
                  <div className="mt-3 rounded-lg bg-secondary p-4 font-mono text-xs overflow-x-auto relative">
                    <pre className="text-primary">{curlExample}</pre>
                    <button
                      onClick={copyExample}
                      className="absolute top-2 right-2 text-xs bg-tertiary hover:bg-border px-2 py-1 rounded"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent font-bold">
                  3
                </span>
                <div className="flex-1">
                  <h3 className="font-medium text-primary">Try the playground</h3>
                  <p className="text-sm text-muted mt-1">
                    Test the API interactively and see example responses.
                  </p>
                  <Link href="/developers/playground">
                    <Button className="mt-3" size="sm" variant="secondary">
                      Open Playground
                    </Button>
                  </Link>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Stats Overview */}
      <div>
        <h2 className="text-xl font-semibold text-primary mb-4">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted">Current Plan</div>
              <div className="mt-2 text-2xl font-bold text-primary">
                {subLoading ? '...' : subscription?.tier?.replace('API_', '') || 'FREE'}
              </div>
              <Link href="/developers/billing">
                <span className="text-xs text-accent hover:underline">Upgrade</span>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted">API Keys</div>
              <div className="mt-2 text-2xl font-bold text-primary">
                {keysLoading ? '...' : apiKeys?.filter(k => k.isActive).length || 0}
              </div>
              <Link href="/developers/keys">
                <span className="text-xs text-accent hover:underline">Manage</span>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted">Requests This Month</div>
              <div className="mt-2 text-2xl font-bold text-primary">
                {subLoading ? '...' : subscription?.usage?.totalRequests?.toLocaleString() || 0}
              </div>
              <span className="text-xs text-muted">
                of{' '}
                {subscription?.quota?.limit === 'unlimited'
                  ? '∞'
                  : subscription?.quota?.limit?.toLocaleString() || 100}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted">Prepaid Credits</div>
              <div className="mt-2 text-2xl font-bold text-primary">
                {subLoading ? '...' : subscription?.credits?.purchasedRemaining?.toLocaleString() || 0}
              </div>
              <Link href="/developers/billing">
                <span className="text-xs text-accent hover:underline">Buy more</span>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted">Rate Limit</div>
              <div className="mt-2 text-2xl font-bold text-primary">
                {subLoading ? '...' : subscription?.rateLimit?.requestsPerMinute || 10}
              </div>
              <span className="text-xs text-muted">requests/minute</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resources */}
      <div>
        <h2 className="text-xl font-semibold text-primary mb-4">Resources</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:border-accent transition-colors">
            <a href="/api/v1/docs/openapi.json" target="_blank" rel="noopener">
              <CardContent className="p-6">
                <div className="text-2xl mb-2">📄</div>
                <h3 className="font-medium text-primary">API Reference</h3>
                <p className="text-sm text-muted mt-1">OpenAPI specification and endpoint details</p>
              </CardContent>
            </a>
          </Card>

          <Link href="/docs">
            <Card className="hover:border-accent transition-colors h-full">
              <CardContent className="p-6">
                <div className="text-2xl mb-2">📚</div>
                <h3 className="font-medium text-primary">Documentation</h3>
                <p className="text-sm text-muted mt-1">Guides, tutorials, and best practices</p>
              </CardContent>
            </Card>
          </Link>

          <Card className="hover:border-accent transition-colors">
            <a href="https://github.com/promptomize/api-examples" target="_blank" rel="noopener">
              <CardContent className="p-6">
                <div className="text-2xl mb-2">💻</div>
                <h3 className="font-medium text-primary">Code Examples</h3>
                <p className="text-sm text-muted mt-1">Sample integrations in popular languages</p>
              </CardContent>
            </a>
          </Card>
        </div>
      </div>
    </div>
  )
}
