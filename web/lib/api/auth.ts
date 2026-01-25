import { api, setTokens, clearTokens } from './client'
import type { AuthResponse, RefreshResponse } from '@/lib/types/api'
import type { User } from '@/lib/types/models'

export interface AppleAuthRequest {
  identityToken: string
  authorizationCode: string
  fullName?: {
    givenName?: string
    familyName?: string
  }
}

export interface GoogleAuthRequest {
  idToken: string
}

export async function signInWithApple(request: AppleAuthRequest): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/apple', request, { skipAuth: true })
  setTokens(response.accessToken, response.refreshToken, response.expiresIn)
  return response
}

export async function signInWithGoogle(request: GoogleAuthRequest): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/google', request, { skipAuth: true })
  setTokens(response.accessToken, response.refreshToken, response.expiresIn)
  return response
}

export async function refreshTokens(): Promise<RefreshResponse> {
  // Call our Next.js API route which reads the HTTP-only refresh token cookie
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include', // Include cookies
  })

  if (!response.ok) {
    throw new Error('Refresh failed')
  }

  const data: RefreshResponse = await response.json()
  setTokens(data.accessToken, data.refreshToken, data.expiresIn)
  return data
}

export async function getCurrentUser(): Promise<User> {
  return api.get<User>('/auth/me')
}

export async function logout(): Promise<void> {
  try {
    await api.post<void>('/auth/logout')
  } finally {
    clearTokens()
  }
}

export async function logoutAllDevices(): Promise<void> {
  try {
    await api.post<void>('/auth/logout-all')
  } finally {
    clearTokens()
  }
}
