'use client'

import { useQuery } from '@tanstack/react-query'
import { getAnalytics, getUserStats, getSessions, getStreak, type AnalyticsQueryParams } from '@/lib/api/analytics'

export function useAnalytics(params: AnalyticsQueryParams = {}) {
  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () => getAnalytics(params),
  })
}

export function useStreak() {
  return useQuery({
    queryKey: ['streak'],
    queryFn: getStreak,
  })
}

export function useUserStats() {
  return useQuery({
    queryKey: ['userStats'],
    queryFn: getUserStats,
  })
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: getSessions,
  })
}
