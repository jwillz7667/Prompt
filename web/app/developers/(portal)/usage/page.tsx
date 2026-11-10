'use client'

import { useState } from 'react'
import { useApiSubscriptionStatus, useApiKeys, useApiKeyUsage } from '@/lib/hooks/useApiKeys'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'

export default function UsagePage() {
  const { data: subscription, isLoading: subLoading } = useApiSubscriptionStatus()
  const { data: apiKeys } = useApiKeys()
  const [selectedKeyId, setSelectedKeyId] = useState<string | undefined>(undefined)

  // Use first key by default
  const activeKeyId = selectedKeyId || apiKeys?.[0]?.id
  const { data: usage, isLoading: usageLoading } = useApiKeyUsage(activeKeyId)

  const quota = subscription?.quota
  const quotaUsedPercent =
    quota && typeof quota.limit === 'number' ? Math.min((quota.used / quota.limit) * 100, 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-primary text-xl font-semibold">Usage Analytics</h2>
        <p className="text-muted text-sm">Monitor your API usage and quota.</p>
      </div>

      {/* Quota Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-muted text-sm">Monthly Requests</div>
            <div className="text-primary mt-2 text-3xl font-bold">
              {subLoading ? '...' : subscription?.usage?.totalRequests?.toLocaleString() || 0}
            </div>
            <div className="mt-2">
              <div className="bg-secondary h-2 overflow-hidden rounded-full">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    quotaUsedPercent > 90
                      ? 'bg-red-500'
                      : quotaUsedPercent > 70
                        ? 'bg-yellow-500'
                        : 'bg-accent',
                  )}
                  style={{ width: `${quotaUsedPercent}%` }}
                />
              </div>
              <div className="text-muted mt-1 text-xs">
                {quota?.remaining === 'unlimited'
                  ? 'Unlimited'
                  : `${quota?.remaining?.toLocaleString() || 0} remaining of ${quota?.limit?.toLocaleString() || 0}`}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-muted text-sm">Tokens Used</div>
            <div className="text-primary mt-2 text-3xl font-bold">
              {subLoading ? '...' : subscription?.usage?.totalTokens?.toLocaleString() || 0}
            </div>
            <div className="text-muted mt-2 text-xs">Input + Output tokens this period</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-muted text-sm">Period Ends</div>
            <div className="text-primary mt-2 text-xl font-bold">
              {subLoading
                ? '...'
                : subscription?.period?.end
                  ? new Date(subscription.period.end).toLocaleDateString()
                  : 'N/A'}
            </div>
            <div className="text-muted mt-2 text-xs">
              {subscription?.period?.end && (
                <>
                  {Math.ceil(
                    (new Date(subscription.period.end).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24),
                  )}{' '}
                  days remaining
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Selector */}
      {apiKeys && apiKeys.length > 1 && (
        <div>
          <label className="text-primary text-sm font-medium">View usage for:</label>
          <select
            value={activeKeyId || ''}
            onChange={(e) => setSelectedKeyId(e.target.value || undefined)}
            className="border-border bg-secondary text-primary ml-3 rounded border px-3 py-1.5 text-sm"
          >
            {apiKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name} ({key.keyPrefix}...)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Detailed Stats */}
      {activeKeyId && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Requests by Day Chart */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-primary mb-4 font-medium">Requests by Day</h3>
              {usageLoading ? (
                <div className="text-muted flex h-48 items-center justify-center">Loading...</div>
              ) : usage?.requestsByDay && usage.requestsByDay.length > 0 ? (
                <div className="h-48">
                  <SimpleBarChart data={usage.requestsByDay} />
                </div>
              ) : (
                <div className="text-muted flex h-48 items-center justify-center">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats Summary */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-primary mb-4 font-medium">Key Statistics</h3>
              {usageLoading ? (
                <div className="text-muted">Loading...</div>
              ) : usage ? (
                <dl className="space-y-4">
                  <div className="flex justify-between">
                    <dt className="text-muted">Total Requests</dt>
                    <dd className="text-primary font-medium">
                      {usage.totalRequests.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Success Rate</dt>
                    <dd className="text-primary font-medium">{usage.successRate}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Avg Latency</dt>
                    <dd className="text-primary font-medium">{usage.avgLatencyMs}ms</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Input Tokens</dt>
                    <dd className="text-primary font-medium">
                      {usage.totalInputTokens.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Output Tokens</dt>
                    <dd className="text-primary font-medium">
                      {usage.totalOutputTokens.toLocaleString()}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="text-muted">No data available</div>
              )}
            </CardContent>
          </Card>

          {/* Requests by Endpoint */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-primary mb-4 font-medium">Requests by Endpoint</h3>
              {usageLoading ? (
                <div className="text-muted">Loading...</div>
              ) : usage?.requestsByEndpoint && Object.keys(usage.requestsByEndpoint).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(usage.requestsByEndpoint)
                    .sort((a, b) => b[1] - a[1])
                    .map(([endpoint, count]) => (
                      <div key={endpoint} className="flex items-center gap-3">
                        <code className="text-muted bg-secondary flex-1 truncate rounded px-2 py-1 text-xs">
                          {endpoint}
                        </code>
                        <span className="text-primary font-medium">{count.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-muted">No data available</div>
              )}
            </CardContent>
          </Card>

          {/* Requests by Modality */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-primary mb-4 font-medium">Requests by Modality</h3>
              {usageLoading ? (
                <div className="text-muted">Loading...</div>
              ) : usage?.requestsByModality && Object.keys(usage.requestsByModality).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(usage.requestsByModality)
                    .sort((a, b) => b[1] - a[1])
                    .map(([modality, count]) => (
                      <div key={modality} className="flex items-center gap-3">
                        <span className="text-primary flex-1 text-sm capitalize">{modality}</span>
                        <span className="text-primary font-medium">{count.toLocaleString()}</span>
                        <div className="bg-secondary h-2 w-24 overflow-hidden rounded-full">
                          <div
                            className="bg-accent h-full rounded-full"
                            style={{
                              width: `${(count / usage.totalRequests) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-muted">No data available</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// Simple bar chart component (no external dependencies)
function SimpleBarChart({
  data,
}: {
  data: Array<{ date: string; requests: number; tokens: number }>
}) {
  const maxRequests = Math.max(...data.map((d) => d.requests), 1)

  return (
    <div className="flex h-full items-end gap-1">
      {data.slice(-14).map((day) => (
        <div key={day.date} className="flex flex-1 flex-col items-center">
          <div className="flex w-full flex-1 items-end">
            <div
              className="bg-accent/20 hover:bg-accent/40 group relative w-full cursor-pointer rounded-t transition-all"
              style={{
                height: `${(day.requests / maxRequests) * 100}%`,
                minHeight: day.requests > 0 ? '4px' : 0,
              }}
            >
              <div className="bg-primary text-secondary pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                {day.requests} requests
              </div>
            </div>
          </div>
          <div className="text-muted mt-1 w-full truncate text-center text-xs">
            {new Date(day.date).getDate()}
          </div>
        </div>
      ))}
    </div>
  )
}
