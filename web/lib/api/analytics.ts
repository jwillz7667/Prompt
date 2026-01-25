import { api } from './client'
import type { AnalyticsResponse, UserStatsResponse, SessionsListResponse } from '@/lib/types/api'

export interface AnalyticsQueryParams {
  period?: 7 | 30 | 90
}

export async function getAnalytics(params: AnalyticsQueryParams = {}): Promise<AnalyticsResponse> {
  const searchParams = new URLSearchParams()
  if (params.period) searchParams.set('period', params.period.toString())

  const query = searchParams.toString()
  return api.get<AnalyticsResponse>(`/analytics${query ? `?${query}` : ''}`)
}

export async function getUserStats(): Promise<UserStatsResponse> {
  return api.get<UserStatsResponse>('/users/stats')
}

export async function getSessions(): Promise<SessionsListResponse> {
  return api.get<SessionsListResponse>('/users/sessions')
}

export async function deleteSession(id: string): Promise<void> {
  return api.delete<void>(`/users/sessions/${id}`)
}
