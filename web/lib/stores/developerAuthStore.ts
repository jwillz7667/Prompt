/**
 * Developer Authentication Store
 * Separate auth store for developer accounts (API access)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Developer {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  isVerified: boolean;
}

interface DeveloperSubscription {
  tier: string;
  status: string;
  includedRequests: number;
  currentPeriodUsage: number;
  currentPeriodEnd: string;
}

interface DeveloperAuthState {
  developer: Developer | null;
  subscription: DeveloperSubscription | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, name?: string, company?: string) => Promise<boolean>;
  logout: () => void;
  refreshTokens: () => Promise<boolean>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  fetchProfile: () => Promise<void>;
}

// Remove trailing /api/v1 if present since we add it in requests
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.promptomize.app';
const API_URL = rawApiUrl.replace(/\/api\/v1\/?$/, '');

export const useDeveloperAuthStore = create<DeveloperAuthState>()(
  persist(
    (set, get) => ({
      developer: null,
      subscription: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/api/v1/developer/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          const data = await res.json();

          if (!res.ok) {
            set({ error: data.error || 'Login failed', isLoading: false });
            return false;
          }

          set({
            developer: data.developer,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          // Fetch full profile with subscription
          get().fetchProfile();

          return true;
        } catch (err) {
          set({ error: 'Network error. Please try again.', isLoading: false });
          return false;
        }
      },

      signup: async (email: string, password: string, name?: string, company?: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/api/v1/developer/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, company }),
          });

          const data = await res.json();

          if (!res.ok) {
            set({ error: data.error || 'Signup failed', isLoading: false });
            return false;
          }

          set({
            developer: data.developer,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          return true;
        } catch (err) {
          set({ error: 'Network error. Please try again.', isLoading: false });
          return false;
        }
      },

      logout: () => {
        const { accessToken } = get();
        if (accessToken) {
          // Fire-and-forget logout request
          fetch(`${API_URL}/api/v1/developer/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
          }).catch(() => {});
        }

        set({
          developer: null,
          subscription: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const res = await fetch(`${API_URL}/api/v1/developer/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!res.ok) {
            get().logout();
            return false;
          }

          const data = await res.json();

          set({
            developer: data.developer,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isAuthenticated: true,
          });

          return true;
        } catch {
          get().logout();
          return false;
        }
      },

      checkAuth: async () => {
        const { accessToken, refreshToken } = get();

        if (!accessToken && !refreshToken) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        set({ isLoading: true });

        // Try to fetch profile with current token
        if (accessToken) {
          try {
            const res = await fetch(`${API_URL}/api/v1/developer/auth/me`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (res.ok) {
              const data = await res.json();
              set({
                developer: data.developer,
                subscription: data.subscription,
                isAuthenticated: true,
                isLoading: false,
              });
              return;
            }

            // Token expired, try refresh
            if (res.status === 401 && refreshToken) {
              const refreshed = await get().refreshTokens();
              if (refreshed) {
                await get().fetchProfile();
                set({ isLoading: false });
                return;
              }
            }
          } catch {
            // Network error
          }
        }

        // Try refresh token
        if (refreshToken) {
          const refreshed = await get().refreshTokens();
          if (refreshed) {
            await get().fetchProfile();
            set({ isLoading: false });
            return;
          }
        }

        set({ isLoading: false, isAuthenticated: false });
      },

      fetchProfile: async () => {
        const { accessToken } = get();
        if (!accessToken) return;

        try {
          const res = await fetch(`${API_URL}/api/v1/developer/auth/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (res.ok) {
            const data = await res.json();
            set({
              developer: data.developer,
              subscription: data.subscription,
            });
          }
        } catch {
          // Ignore errors
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'developer-auth-storage',
      partialize: (state) => ({
        developer: state.developer,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
