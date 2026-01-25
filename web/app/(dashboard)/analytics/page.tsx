'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/shared/error-boundary'
import { useAnalytics, useUserStats } from '@/lib/hooks/useAnalytics'
import { formatNumber, formatDuration } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils/cn'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Sparkles,
  Zap,
  Clock,
  Star,
  Flame,
  TrendingUp,
  Calendar,
} from 'lucide-react'

const COLORS = ['#5B4CDB', '#00E6E6', '#F5A623', '#FF6B6B', '#4ECDC4', '#A78BFA']

type Period = 7 | 30 | 90

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>(30)

  const { data: analytics, isLoading, error, refetch } = useAnalytics({ period })
  const { data: userStats } = useUserStats()

  const summary = analytics?.summary
  const daily = analytics?.daily || []
  const topTones = analytics?.topTones || []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analytics</h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Track your prompt enhancement activity
          </p>
        </div>

        <div className="flex gap-2">
          {([7, 30, 90] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p} days
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-10 w-10 rounded-xl mb-4" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-4 w-24" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorDisplay onRetry={() => refetch()} />
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-indigo/10">
                  <Sparkles className="h-5 w-5 text-brand-indigo" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {formatNumber(summary?.totalPrompts || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Total Prompts</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan/10">
                  <Zap className="h-5 w-5 text-brand-cyan" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {formatNumber(summary?.totalTokensUsed || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Tokens Used</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
                  <Clock className="h-5 w-5 text-yellow-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {formatDuration(summary?.averageProcessingTime || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Avg. Processing</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                  <Flame className="h-5 w-5 text-orange-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {summary?.currentStreak || 0}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Day Streak
                {summary?.longestStreak && summary.longestStreak > 0 && (
                  <span className="text-[var(--text-tertiary)]">
                    {' '}(best: {summary.longestStreak})
                  </span>
                )}
              </p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily activity chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-brand-indigo" />
                  Daily Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {daily.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={daily}>
                        <XAxis
                          dataKey="date"
                          tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                          tickFormatter={(value) => {
                            const date = new Date(value)
                            return `${date.getMonth() + 1}/${date.getDate()}`
                          }}
                        />
                        <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                          }}
                          labelStyle={{ color: 'var(--text-primary)' }}
                        />
                        <Bar dataKey="promptCount" fill="#5B4CDB" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-[var(--text-tertiary)]">
                    No data for this period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top tones chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-brand-cyan" />
                  Favorite Tones
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topTones.length > 0 ? (
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={topTones}
                          dataKey="count"
                          nameKey="tone"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                        >
                          {topTones.map((entry, index) => (
                            <Cell key={entry.tone} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute">
                      <div className="flex flex-wrap gap-2 justify-center mt-4">
                        {topTones.map((entry, index) => (
                          <Badge
                            key={entry.tone}
                            variant="outline"
                            className="capitalize"
                            style={{ borderColor: COLORS[index % COLORS.length] }}
                          >
                            {entry.tone} ({entry.count})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-[var(--text-tertiary)]">
                    No tone data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Additional stats */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-brand-indigo" />
              Account Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Total Prompts</p>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {formatNumber(userStats?.totalPrompts || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Total Tokens</p>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {formatNumber(userStats?.totalTokens || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Favorites</p>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {formatNumber(summary?.favoriteCount || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Member Since</p>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {userStats?.memberSince
                    ? new Date(userStats.memberSince).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-'}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
