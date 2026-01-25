'use client'

import { Suspense, useEffect, useState } from 'react'
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

// Inner component that handles search params (needs Suspense)
function DashboardContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore()
  const { fetchSubscription, refreshAfterPurchase } = useSubscriptionStore()
  const { sidebarCollapsed } = useUIStore()
  const [isInitialized, setIsInitialized] = useState(false)

  console.log('DashboardContent render:', { authLoading, isAuthenticated, isInitialized })

  // Handle OAuth callback tokens and initial auth check
  useEffect(() => {
    const initAuth = async () => {
      const token = searchParams.get('token')
      const expiresIn = searchParams.get('expiresIn')
      const checkout = searchParams.get('checkout')
      const fullUrl = typeof window !== 'undefined' ? window.location.href : 'SSR'

      console.log('initAuth:', {
        token: token ? token.substring(0, 20) + '...' : null,
        expiresIn,
        checkout,
        fullUrl,
        searchParamsString: searchParams.toString()
      })

      if (token && expiresIn) {
        console.log('Setting tokens from callback...')
        setTokens(token, '', parseInt(expiresIn, 10))
        // Check if token was stored
        const storedToken = typeof window !== 'undefined' ? sessionStorage.getItem('accessToken') : null
        console.log('Token stored in sessionStorage:', storedToken ? storedToken.substring(0, 20) + '...' : null)
        router.replace('/dashboard')
      } else {
        // Check if there's already a token in storage
        const existingToken = typeof window !== 'undefined' ? sessionStorage.getItem('accessToken') : null
        console.log('No token in URL, existing token in storage:', existingToken ? existingToken.substring(0, 20) + '...' : null)
      }

      // Handle Stripe checkout
      if (checkout === 'success') {
        toast.success('Subscription activated!', 'Thank you for your purchase')
        refreshAfterPurchase()
        router.replace('/dashboard')
      } else if (checkout === 'canceled') {
        toast.info('Checkout canceled', 'No charges were made')
        router.replace('/upgrade')
      }

      // Now check auth (after token is stored)
      console.log('Calling checkAuth...')
      try {
        const result = await checkAuth()
        console.log('checkAuth result:', result)
      } catch (err) {
        console.error('checkAuth error:', err)
      }
      setIsInitialized(true)
    }

    initAuth()
  }, []) // Run once on mount

  // Redirect to login if not authenticated
  useEffect(() => {
    if (isInitialized && !authLoading && !isAuthenticated) {
      console.log('Redirecting to login...')
      router.push('/login')
    }
  }, [isInitialized, authLoading, isAuthenticated, router])

  // Fetch subscription when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSubscription()
    }
  }, [isAuthenticated, fetchSubscription])

  // Show loading while initializing or checking auth
  if (!isInitialized || authLoading) {
    return <LoadingState fullScreen message="Loading your workspace..." />
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<LoadingState fullScreen message="Loading..." />}>
      <DashboardContent>{children}</DashboardContent>
    </Suspense>
  )
}
