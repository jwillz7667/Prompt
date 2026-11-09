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
  refreshAfterPurchase: () => Promise<boolean>
  reset: () => void
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
    maxTokensPerPrompt: 4096,
  },
}

let subscriptionGeneration = 0

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  ...defaultSubscription,
  isLoading: false,
  error: null,
  trialEligible: null,

  reset: () => { subscriptionGeneration++; set({ ...defaultSubscription, billingProvider: null, stripeCustomerId: null, error: null, isLoading: false, trialEligible: null }) },

  fetchSubscription: async () => {
    const generation = subscriptionGeneration
    try {
      set({ isLoading: true, error: null })
      const data = await getSubscriptionStatus()
      if (generation !== subscriptionGeneration) return
      set({
        subscription: { ...data.subscription, autoRenewEnabled: data.autoRenewEnabled ?? data.subscription.autoRenewEnabled ?? false },
        usage: data.usage,
        features: data.features,
        billingProvider: data.billingProvider,
        stripeCustomerId: data.stripeCustomerId,
        isLoading: false,
      })
    } catch (err) {
      if (generation !== subscriptionGeneration) return
      const message = err instanceof Error ? err.message : 'Failed to fetch subscription'
      set({ error: message, isLoading: false })
    }
  },

  checkTrialEligibility: async () => {
    const generation = subscriptionGeneration
    try {
      const { eligible } = await getTrialEligibility()
      if (generation !== subscriptionGeneration) return false
      set({ trialEligible: eligible })
      return eligible
    } catch {
      if (generation !== subscriptionGeneration) return false
      set({ trialEligible: false })
      return false
    }
  },

  startTrial: async () => {
    const generation = subscriptionGeneration
    try {
      set({ isLoading: true, error: null })
      const result = await apiStartTrial()
      if (generation !== subscriptionGeneration) return false
      if (result.success) {
        await get().fetchSubscription()
        if (generation !== subscriptionGeneration) return false
        set({ trialEligible: false })
        return true
      }
      set({ isLoading: false })
      return false
    } catch (err) {
      if (generation !== subscriptionGeneration) return false
      const message = err instanceof Error ? err.message : 'Failed to start trial'
      set({ error: message, isLoading: false })
      return false
    }
  },

  setError: (error) => set({ error }),

  refreshAfterPurchase: async () => {
    const generation = subscriptionGeneration
    // Checkout redirects can arrive before webhooks. Confirm entitlement before
    // announcing activation; a delayed webhook must never look like a payment failure.
    for (let attempt = 0; attempt < 6; attempt++) {
      await get().fetchSubscription()
      if (generation !== subscriptionGeneration) return false
      const state = get()
      if (!state.error && state.billingProvider === 'stripe' &&
        state.subscription.tier !== 'FREE' && !state.subscription.isTrialing &&
        state.subscription.status === 'ACTIVE') return true
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000))
    }
    return false
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
    remaining: state.usage.dailyPromptsLimit === -1 ? Infinity : Math.max(0, state.usage.dailyPromptsLimit - state.usage.dailyPromptsUsed),
  }))

export const useCanExport = () =>
  useSubscriptionStore((state) => state.features.canExport)
