'use client'

import { useEffect } from 'react'
import {
  useSubscriptionStore,
  useIsPremium,
  useIsPro,
  useCanCreatePrompt,
  useDailyUsage,
  useCanExport,
} from '@/lib/stores/subscriptionStore'
import { useAuthStore } from '@/lib/stores/authStore'

export function useSubscription() {
  const { isAuthenticated } = useAuthStore()
  const {
    subscription,
    usage,
    features,
    billingProvider,
    isLoading,
    error,
    fetchSubscription,
    refreshAfterPurchase,
  } = useSubscriptionStore()

  useEffect(() => {
    if (isAuthenticated) {
      fetchSubscription()
    }
  }, [isAuthenticated, fetchSubscription])

  return {
    subscription,
    usage,
    features,
    billingProvider,
    isLoading,
    error,
    refreshAfterPurchase,
    refetch: fetchSubscription,
  }
}

export { useIsPremium, useIsPro, useCanCreatePrompt, useDailyUsage, useCanExport }
