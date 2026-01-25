'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { MobileNav } from '@/components/layout/mobile-nav'
import { useAuthStore } from '@/lib/stores/authStore'
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'
import { useUIStore } from '@/lib/stores/uiStore'
import { LoadingState } from '@/components/shared/loading-state'
import { setTokens } from '@/lib/api/client'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/lib/stores/uiStore'

// Separate component for search params handling to enable Suspense boundary
function AuthCallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { checkAuth } = useAuthStore()
  const { refreshAfterPurchase } = useSubscriptionStore()

  useEffect(() => {
    const token = searchParams.get('token')
    const expiresIn = searchParams.get('expiresIn')
    const checkout = searchParams.get('checkout')

    if (token && expiresIn) {
      // Store tokens from OAuth callback
      setTokens(token, '', parseInt(expiresIn, 10))
      // Clean up URL
      router.replace('/dashboard')
      // Refresh auth state
      checkAuth()
    } else {
      checkAuth()
    }

    // Handle Stripe checkout success
    if (checkout === 'success') {
      toast.success('Subscription activated!', 'Thank you for your purchase')
      refreshAfterPurchase()
      router.replace('/dashboard')
    } else if (checkout === 'canceled') {
      toast.info('Checkout canceled', 'No charges were made')
      router.replace('/upgrade')
    }
  }, [searchParams, router, checkAuth, refreshAfterPurchase])

  return null
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore()
  const { fetchSubscription } = useSubscriptionStore()
  const { sidebarCollapsed } = useUIStore()

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    if (isAuthenticated) {
      fetchSubscription()
    }
  }, [isAuthenticated, fetchSubscription])

  if (authLoading) {
    return <LoadingState fullScreen message="Loading your workspace..." />
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Auth callback handler wrapped in Suspense */}
      <Suspense fallback={null}>
        <AuthCallbackHandler />
      </Suspense>

      {/* Sidebar - desktop only */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile navigation */}
      <MobileNav />

      {/* Header */}
      <Header />

      {/* Main content */}
      <main
        className={cn(
          'pt-16 transition-all duration-300',
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        )}
      >
        <div className="min-h-[calc(100vh-4rem)] p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
