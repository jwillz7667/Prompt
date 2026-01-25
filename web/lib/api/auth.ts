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
  const response = await api.post<RefreshResponse>('/auth/refresh', undefined, { skipAuth: true })
  setTokens(response.accessToken, response.refreshToken, response.expiresIn)
  return response
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
