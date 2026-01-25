import { create } from 'zustand'
import type { SubscriptionInfo } from '@/lib/types/models'
import { getSubscriptionStatus, getTrialEligibility, startFreeTrial as apiStartTrial } from '@/lib/api/subscriptions'

interface SubscriptionState extends SubscriptionInfo {
  isLoading: boolean
  error: string | null
  trialEligible: boolean | null

  // Actions
  fetchSubscription: () => Promise<void>
  checkTrialEligibility: () => Promise<boolean>
  startTrial: () => Promise<boolean>
  setError: (error: string | null) => void
  refreshAfterPurchase: () => Promise<void>
}

const defaultSubscription: SubscriptionInfo = {
  subscription: {
    tier: 'FREE',
    status: 'ACTIVE',
    expiresAt: null,
    isTrialing: false,
    trialEndsAt: null,
    autoRenewEnabled: false,
  },
  usage: {
    dailyPromptsUsed: 0,
    dailyPromptsLimit: 10,
    canCreatePrompt: true,
  },
  features: {
    promptQuality: 'basic',
    canExport: false,
    canUseBatchMode: false,
    maxTokensPerPrompt: 4096,
  },
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  ...defaultSubscription,
  isLoading: false,
  error: null,
  trialEligible: null,

  fetchSubscription: async () => {
    try {
      set({ isLoading: true, error: null })
      const data = await getSubscriptionStatus()
      set({
        subscription: data.subscription,
        usage: data.usage,
        features: data.features,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch subscription'
      set({ error: message, isLoading: false })
    }
  },

  checkTrialEligibility: async () => {
    try {
      const { eligible } = await getTrialEligibility()
      set({ trialEligible: eligible })
      return eligible
    } catch {
      set({ trialEligible: false })
      return false
    }
  },

  startTrial: async () => {
    try {
      set({ isLoading: true, error: null })
      const result = await apiStartTrial()
      if (result.success) {
        await get().fetchSubscription()
        set({ trialEligible: false })
        return true
      }
      return false
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start trial'
      set({ error: message, isLoading: false })
      return false
    }
  },

  setError: (error) => set({ error }),

  refreshAfterPurchase: async () => {
    // Small delay to allow webhook to process
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await get().fetchSubscription()
  },
}))

// Helper selectors
export const useIsPremium = () =>
  useSubscriptionStore((state) => state.subscription.tier === 'PREMIUM')

export const useIsPro = () =>
  useSubscriptionStore((state) =>
    state.subscription.tier === 'PRO' || state.subscription.tier === 'PREMIUM'
  )

export const useCanCreatePrompt = () =>
  useSubscriptionStore((state) => state.usage.canCreatePrompt)

export const useDailyUsage = () =>
  useSubscriptionStore((state) => ({
    used: state.usage.dailyPromptsUsed,
    limit: state.usage.dailyPromptsLimit,
    remaining: state.usage.dailyPromptsLimit - state.usage.dailyPromptsUsed,
  }))

export const useCanExport = () =>
  useSubscriptionStore((state) => state.features.canExport)

export const useCanBatch = () =>
  useSubscriptionStore((state) => state.features.canUseBatchMode)
