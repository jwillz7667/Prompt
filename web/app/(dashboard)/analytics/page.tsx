'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/shared/error-boundary'
import { useAnalytics, useStreak, useUserStats } from '@/lib/hooks/useAnalytics'
import { formatNumber, formatDuration } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils/cn'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Sparkles,
  Zap,
  Star,
  Flame,
  TrendingUp,
  Calendar,
  Trophy,
  Layers,
  FileText,
  Hash,
  Cpu,
} from 'lucide-react'

const COLORS = ['#5B4CDB', '#00E6E6', '#F5A623', '#FF6B6B', '#4ECDC4', '#A78BFA', '#10B981', '#F472B6']

type Period = 7 | 30 | 90

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>(30)

  const { data: analytics, isLoading, error, refetch } = useAnalytics({ period })
  const { data: streak } = useStreak()
  const { data: userStats } = useUserStats()

  const summary = analytics?.summary
  const charts = analytics?.charts
  const dailyData = charts?.promptsByDay || []
  const modelUsage = charts?.modelUsage || []
  const topTags = charts?.topTags || []

  // Format model names for display
  const formatModelName = (model: string) => {
    if (model?.includes('reasoner')) return 'Deep Think'
    if (model?.includes('chat')) return 'Fast Mode'
    return model || 'Unknown'
  }

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
          {[...Array(8)].map((_, i) => (
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
          {/* Stats Cards - Row 1 */}
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
                {formatNumber(summary?.totalTokens || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Total Tokens</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
                  <Star className="h-5 w-5 text-yellow-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {formatNumber(summary?.favoriteCount || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Favorites</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                  <Flame className="h-5 w-5 text-orange-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {streak?.currentStreak || 0}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Current Streak
                {streak?.longestStreak && streak.longestStreak > 0 && (
                  <span className="text-[var(--text-tertiary)]">
                    {' '}(best: {streak.longestStreak})
                  </span>
                )}
              </p>
            </Card>
          </div>

          {/* Stats Cards - Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {summary?.avgPromptsPerDay?.toFixed(1) || '0'}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Avg/Day</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                  <Hash className="h-5 w-5 text-purple-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {formatNumber(summary?.avgTokensPerPrompt || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Avg Tokens/Prompt</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                  <Layers className="h-5 w-5 text-blue-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {formatNumber(summary?.collectionCount || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Collections</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
                  <FileText className="h-5 w-5 text-pink-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                {formatNumber(summary?.templateCount || 0)}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Templates</p>
            </Card>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily activity chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-brand-indigo" />
                  Prompts Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData}>
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
                          formatter={(value: number) => [value, 'Prompts']}
                        />
                        <Bar dataKey="count" fill="#5B4CDB" radius={[4, 4, 0, 0]} />
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

            {/* Model usage chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-brand-cyan" />
                  Model Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                {modelUsage.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={modelUsage.map(m => ({ ...m, name: formatModelName(m.model) }))}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={5}
                        >
                          {modelUsage.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
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
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                      {modelUsage.map((entry, index) => (
                        <Badge
                          key={entry.model}
                          variant="outline"
                          style={{ borderColor: COLORS[index % COLORS.length] }}
                        >
                          {formatModelName(entry.model)} ({entry.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-[var(--text-tertiary)]">
                    No model data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2 - Top Tags */}
          {topTags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-brand-indigo" />
                  Top Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topTags.slice(0, 10)} layout="vertical">
                      <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="tag"
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                        }}
                        labelStyle={{ color: 'var(--text-primary)' }}
                      />
                      <Bar dataKey="count" fill="#00E6E6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Streak Section */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Activity Streak
            </h3>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 mx-auto mb-3">
                  <Flame className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {streak?.currentStreak || 0}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">Current Streak</p>
              </div>
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10 mx-auto mb-3">
                  <Trophy className="h-6 w-6 text-yellow-500" />
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {streak?.longestStreak || 0}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">Longest Streak</p>
              </div>
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 mx-auto mb-3">
                  <Calendar className="h-6 w-6 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {streak?.totalActiveDays || 0}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">Active Days</p>
              </div>
            </div>
          </Card>

          {/* Account Summary */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-brand-indigo" />
              Account Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Total Prompts</p>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {formatNumber(userStats?.totalPrompts || summary?.totalPrompts || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Total Tokens</p>
                <p className="text-xl font-bold text-[var(--text-primary)]">
                  {formatNumber(userStats?.totalTokens || summary?.totalTokens || 0)}
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
