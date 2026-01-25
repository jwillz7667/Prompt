'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/authStore'

export function useAuth(options: { required?: boolean; redirectTo?: string } = {}) {
  const { required = false, redirectTo = '/login' } = options
  const router = useRouter()
  const { user, isAuthenticated, isLoading, checkAuth, logout, error, clearError } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isLoading && required && !isAuthenticated) {
      router.push(redirectTo)
    }
  }, [isLoading, required, isAuthenticated, router, redirectTo])

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    logout,
    clearError,
  }
}

export function useRequireAuth(redirectTo = '/login') {
  return useAuth({ required: true, redirectTo })
}
