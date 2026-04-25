/**
 * Developer API Client
 *
 * API client specifically for developer portal requests.
 * Uses developer auth tokens from the developer auth store.
 */

import { useDeveloperAuthStore } from '@/lib/stores/developerAuthStore'
import type { APIError } from '@/lib/types/api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  headers?: Record<string, string>
}

// Get current developer access token from the store
function getDeveloperAccessToken(): string | null {
  return useDeveloperAuthStore.getState().accessToken
}

// Refresh developer tokens
async function refreshDeveloperTokens(): Promise<string | null> {
  const state = useDeveloperAuthStore.getState()
  const success = await state.refreshTokens()
  if (success) {
    return useDeveloperAuthStore.getState().accessToken
  }
  return null
}

// Main developer API client
export async function developerApiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  // Add developer auth token
  const token = getDeveloperAccessToken()
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`
  }

  const config: RequestInit = {
    method,
    headers: requestHeaders,
  }

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body)
  }

  const response = await fetch(url, config)

  // Handle 401 - try refresh once
  if (response.status === 401) {
    const newToken = await refreshDeveloperTokens()
    if (newToken) {
      requestHeaders['Authorization'] = `Bearer ${newToken}`
      const retryResponse = await fetch(url, {
        ...config,
        headers: requestHeaders,
      })

      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({
          error: 'Request failed',
          message: 'An unexpected error occurred',
          statusCode: retryResponse.status,
        }))
        throw error as APIError
      }

      if (retryResponse.status === 204) {
        return undefined as T
      }

      return retryResponse.json()
    }

    // Refresh failed, logout and throw
    useDeveloperAuthStore.getState().logout()
    throw {
      error: 'Unauthorized',
      message: 'Session expired. Please sign in again.',
      statusCode: 401,
    } as APIError
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'Request failed',
      message: 'An unexpected error occurred',
      statusCode: response.status,
    }))
    throw error as APIError
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// Convenience methods for developer API
export const developerApi = {
  get: <T>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    developerApiClient<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    developerApiClient<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    developerApiClient<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    developerApiClient<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    developerApiClient<T>(endpoint, { ...options, method: 'DELETE' }),
}
