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
    quota && typeof quota.limit === 'number'
      ? Math.min((quota.used / quota.limit) * 100, 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-primary">Usage Analytics</h2>
        <p className="text-sm text-muted">Monitor your API usage and quota.</p>
      </div>

      {/* Quota Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-muted">Monthly Requests</div>
            <div className="mt-2 text-3xl font-bold text-primary">
              {subLoading ? '...' : subscription?.usage?.totalRequests?.toLocaleString() || 0}
            </div>
            <div className="mt-2">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    quotaUsedPercent > 90 ? 'bg-red-500' : quotaUsedPercent > 70 ? 'bg-yellow-500' : 'bg-accent'
                  )}
                  style={{ width: `${quotaUsedPercent}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted">
                {quota?.remaining === 'unlimited'
                  ? 'Unlimited'
                  : `${quota?.remaining?.toLocaleString() || 0} remaining of ${quota?.limit?.toLocaleString() || 0}`}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-muted">Tokens Used</div>
            <div className="mt-2 text-3xl font-bold text-primary">
              {subLoading ? '...' : subscription?.usage?.totalTokens?.toLocaleString() || 0}
            </div>
            <div className="mt-2 text-xs text-muted">
              Input + Output tokens this period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-muted">Period Ends</div>
            <div className="mt-2 text-xl font-bold text-primary">
              {subLoading
                ? '...'
                : subscription?.period?.end
                  ? new Date(subscription.period.end).toLocaleDateString()
                  : 'N/A'}
            </div>
            <div className="mt-2 text-xs text-muted">
              {subscription?.period?.end && (
                <>
                  {Math.ceil(
                    (new Date(subscription.period.end).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24)
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
          <label className="text-sm font-medium text-primary">View usage for:</label>
          <select
            value={activeKeyId || ''}
            onChange={(e) => setSelectedKeyId(e.target.value || undefined)}
            className="ml-3 rounded border border-border bg-secondary px-3 py-1.5 text-sm text-primary"
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
              <h3 className="font-medium text-primary mb-4">Requests by Day</h3>
              {usageLoading ? (
                <div className="h-48 flex items-center justify-center text-muted">Loading...</div>
              ) : usage?.requestsByDay && usage.requestsByDay.length > 0 ? (
                <div className="h-48">
                  <SimpleBarChart data={usage.requestsByDay} />
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats Summary */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-medium text-primary mb-4">Key Statistics</h3>
              {usageLoading ? (
                <div className="text-muted">Loading...</div>
              ) : usage ? (
                <dl className="space-y-4">
                  <div className="flex justify-between">
                    <dt className="text-muted">Total Requests</dt>
                    <dd className="font-medium text-primary">
                      {usage.totalRequests.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Success Rate</dt>
                    <dd className="font-medium text-primary">{usage.successRate}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Avg Latency</dt>
                    <dd className="font-medium text-primary">{usage.avgLatencyMs}ms</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Input Tokens</dt>
                    <dd className="font-medium text-primary">
                      {usage.totalInputTokens.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Output Tokens</dt>
                    <dd className="font-medium text-primary">
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
              <h3 className="font-medium text-primary mb-4">Requests by Endpoint</h3>
              {usageLoading ? (
                <div className="text-muted">Loading...</div>
              ) : usage?.requestsByEndpoint &&
                Object.keys(usage.requestsByEndpoint).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(usage.requestsByEndpoint)
                    .sort((a, b) => b[1] - a[1])
                    .map(([endpoint, count]) => (
                      <div key={endpoint} className="flex items-center gap-3">
                        <code className="text-xs text-muted bg-secondary px-2 py-1 rounded flex-1 truncate">
                          {endpoint}
                        </code>
                        <span className="font-medium text-primary">{count.toLocaleString()}</span>
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
              <h3 className="font-medium text-primary mb-4">Requests by Modality</h3>
              {usageLoading ? (
                <div className="text-muted">Loading...</div>
              ) : usage?.requestsByModality &&
                Object.keys(usage.requestsByModality).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(usage.requestsByModality)
                    .sort((a, b) => b[1] - a[1])
                    .map(([modality, count]) => (
                      <div key={modality} className="flex items-center gap-3">
                        <span className="text-sm text-primary capitalize flex-1">{modality}</span>
                        <span className="font-medium text-primary">{count.toLocaleString()}</span>
                        <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
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
    <div className="flex items-end gap-1 h-full">
      {data.slice(-14).map((day) => (
        <div key={day.date} className="flex-1 flex flex-col items-center">
          <div className="w-full flex-1 flex items-end">
            <div
              className="w-full bg-accent/20 hover:bg-accent/40 rounded-t transition-all cursor-pointer group relative"
              style={{ height: `${(day.requests / maxRequests) * 100}%`, minHeight: day.requests > 0 ? '4px' : 0 }}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-primary text-secondary text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {day.requests} requests
              </div>
            </div>
          </div>
          <div className="text-xs text-muted mt-1 truncate w-full text-center">
            {new Date(day.date).getDate()}
          </div>
        </div>
      ))}
    </div>
  )
}
