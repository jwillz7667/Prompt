import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '@/lib/types/models'
import { setTokens, clearTokens, getAccessToken } from '@/lib/api/client'
import { getCurrentUser, logout as apiLogout, logoutAllDevices as apiLogoutAll, refreshTokens } from '@/lib/api/auth'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  loginWithTokens: (accessToken: string, refreshToken: string, expiresIn: number, user: User) => void
  checkAuth: () => Promise<boolean>
  logout: () => Promise<void>
  logoutAllDevices: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      loginWithTokens: (accessToken, refreshToken, expiresIn, user) => {
        setTokens(accessToken, refreshToken, expiresIn)
        set({ user, isAuthenticated: true, error: null })
      },

      checkAuth: async () => {
        set({ isLoading: true })
        let token = getAccessToken()

        // If no access token, try to refresh using the HTTP-only refresh token cookie
        if (!token) {
          try {
            const response = await refreshTokens()
            token = response.accessToken
          } catch {
            set({ user: null, isAuthenticated: false, isLoading: false })
            return false
          }
        }

        try {
          const user = await getCurrentUser()
          set({ user, isAuthenticated: true, isLoading: false })
          return true
        } catch {
          // Token invalid - clear everything and require re-login
          clearTokens()
          set({ user: null, isAuthenticated: false, isLoading: false })
          return false
        }
      },

      logout: async () => {
        try {
          await apiLogout()
        } catch {
          // Ignore errors, clear local state anyway
        } finally {
          clearTokens()
          set({ user: null, isAuthenticated: false, error: null })
        }
      },

      logoutAllDevices: async () => {
        try {
          await apiLogoutAll()
        } catch {
          // Ignore errors, clear local state anyway
        } finally {
          clearTokens()
          set({ user: null, isAuthenticated: false, error: null })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
)
