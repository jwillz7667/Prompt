'use client'

import { useEffect } from 'react'
import { useSubscriptionStore, useIsPremium, useIsPro, useCanCreatePrompt, useDailyUsage, useCanExport } from '@/lib/stores/subscriptionStore'
import { useAuthStore } from '@/lib/stores/authStore'

export function useSubscription() {
  const { isAuthenticated } = useAuthStore()
  const {
    subscription,
    usage,
    features,
    isLoading,
    error,
    trialEligible,
    fetchSubscription,
    checkTrialEligibility,
    startTrial,
    refreshAfterPurchase,
  } = useSubscriptionStore()

  useEffect(() => {
    if (isAuthenticated) {
      fetchSubscription()
      checkTrialEligibility()
    }
  }, [isAuthenticated, fetchSubscription, checkTrialEligibility])

  return {
    subscription,
    usage,
    features,
    isLoading,
    error,
    trialEligible,
    startTrial,
    refreshAfterPurchase,
    refetch: fetchSubscription,
  }
}

export { useIsPremium, useIsPro, useCanCreatePrompt, useDailyUsage, useCanExport }
