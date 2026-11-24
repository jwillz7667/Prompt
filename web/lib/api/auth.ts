import { api, setTokens, clearTokens, refreshAccessToken, getSessionGeneration } from './client'
import type { AuthResponse } from '@/lib/types/api'
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

export async function refreshTokens(): Promise<{ accessToken: string }> {
  const accessToken = await refreshAccessToken()
  if (!accessToken) throw new Error('Please sign in again.')
  return { accessToken }
}

export async function getCurrentUser(): Promise<User> {
  const { user } = await api.get<{ user: User }>('/auth/me')
  return user
}

export async function logout(): Promise<void> {
  const generation = getSessionGeneration()
  try {
    await api.post<void>('/auth/logout')
  } finally {
    if (generation !== getSessionGeneration()) return
    clearTokens()
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  }
}

export async function logoutAllDevices(): Promise<void> {
  const generation = getSessionGeneration()
  try {
    await api.post<void>('/auth/logout-all')
  } finally {
    if (generation !== getSessionGeneration()) return
    clearTokens()
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  }
}
