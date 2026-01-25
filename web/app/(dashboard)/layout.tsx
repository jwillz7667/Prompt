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


  // Handle OAuth callback tokens and initial auth check
  useEffect(() => {
    const initAuth = async () => {
      // Check for token in URL params (legacy)
      const tokenParam = searchParams.get('token')
      const expiresInParam = searchParams.get('expiresIn')
      const checkout = searchParams.get('checkout')

      // Check for token in cookies (new method)
      const getCookie = (name: string) => {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }

      const tokenCookie = getCookie('accessToken')
      const expiresInCookie = getCookie('tokenExpiresIn')

      // Use cookie if available, fallback to URL params
      const token = tokenCookie || tokenParam
      const expiresIn = expiresInCookie || expiresInParam


      if (token && expiresIn) {
        setTokens(token, '', parseInt(expiresIn, 10))

        // Clear the temporary cookies
        if (typeof document !== 'undefined') {
          document.cookie = 'accessToken=; Max-Age=0; path=/'
          document.cookie = 'tokenExpiresIn=; Max-Age=0; path=/'
        }

        // Clean up URL if it had params
        if (tokenParam) {
          router.replace('/dashboard')
        }
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
      await checkAuth()
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
