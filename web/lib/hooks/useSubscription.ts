'use client'

import { useEffect } from 'react'
import { useSubscriptionStore, useIsEntitled, useCanExport } from '@/lib/stores/subscriptionStore'
import { useAuthStore } from '@/lib/stores/authStore'

export function useSubscription() {
  const { isAuthenticated } = useAuthStore()
  const {
    subscription,
    features,
    billingProvider,
    isEntitled,
    trialEligible,
    hasLoaded,
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
    features,
    billingProvider,
    isEntitled,
    trialEligible,
    hasLoaded,
    isLoading,
    error,
    refreshAfterPurchase,
    refetch: fetchSubscription,
  }
}

export { useIsEntitled, useCanExport }
