import type { RefreshResponse, APIError } from '@/lib/types/api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  headers?: Record<string, string>
  skipAuth?: boolean
}

interface TokenStore {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
}

let tokenStore: TokenStore = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
}

let refreshPromise: Promise<string | null> | null = null

// Token management
export function setTokens(accessToken: string, refreshToken: string | undefined, expiresIn: number) {
  tokenStore = {
    accessToken,
    refreshToken: refreshToken || null,
    expiresAt: Date.now() + expiresIn * 1000,
  }
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('accessToken', accessToken)
    // Refresh token is stored in HTTP-only cookie by the server
  }
}

export function getAccessToken(): string | null {
  if (tokenStore.accessToken) {
    return tokenStore.accessToken
  }
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('accessToken')
    if (token) {
      tokenStore.accessToken = token
      return token
    }
  }
  return null
}

export function clearTokens() {
  tokenStore = { accessToken: null, refreshToken: null, expiresAt: null }
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('accessToken')
  }
}

export function isTokenExpired(): boolean {
  if (!tokenStore.expiresAt) return true
  // Consider expired 30 seconds before actual expiry
  return Date.now() > tokenStore.expiresAt - 30000
}

async function refreshAccessToken(): Promise<string | null> {
  // Prevent concurrent refresh attempts
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Include HTTP-only cookies
      })

      if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) {
          clearTokens()
        }
        return null
      }

      const data: RefreshResponse = await response.json()
      setTokens(data.accessToken, data.refreshToken, data.expiresIn)
      return data.accessToken
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// Main API client
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  // Add auth token if available and not skipped
  if (!skipAuth) {
    let token = getAccessToken()

    // Refresh if expired
    if (token && isTokenExpired()) {
      token = await refreshAccessToken()
    }

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`
    }
  }

  const config: RequestInit = {
    method,
    headers: requestHeaders,
    credentials: 'include',
  }

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body)
  }

  const response = await fetch(url, config)

  // Handle 401 - try refresh once
  if (response.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken()
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

    // Refresh failed, clear tokens and throw
    clearTokens()
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

// Streaming API client for SSE
export async function* streamClient(
  endpoint: string,
  body: unknown
): AsyncGenerator<string, void, unknown> {
  const url = `${API_BASE_URL}${endpoint}`

  let token = getAccessToken()
  if (token && isTokenExpired()) {
    token = await refreshAccessToken()
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'Stream failed',
      message: 'Failed to start enhancement stream',
      statusCode: response.status,
    }))
    throw error as APIError
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data && data !== '[DONE]') {
            yield data
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim()
      if (data && data !== '[DONE]') {
        yield data
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiClient<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiClient<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiClient<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),

  stream: (endpoint: string, body: unknown) => streamClient(endpoint, body),
}
