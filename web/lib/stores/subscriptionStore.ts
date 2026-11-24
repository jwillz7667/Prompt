import { create } from 'zustand'
import type { SubscriptionInfo } from '@/lib/types/models'
import { getSubscriptionStatus } from '@/lib/api/subscriptions'

interface SubscriptionState extends SubscriptionInfo {
  // Server-decided: true while any store (App Store or Stripe) grants Premium.
  isEntitled: boolean
  // Whether a web checkout would include the free trial right now.
  trialEligible: boolean
  hasLoaded: boolean
  isLoading: boolean
  error: string | null

  // Actions
  fetchSubscription: () => Promise<void>
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
    dailyPromptsLimit: 0,
    canCreatePrompt: false,
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
  isEntitled: false,
  trialEligible: false,
  hasLoaded: false,
  isLoading: false,
  error: null,

  reset: () => {
    subscriptionGeneration++
    set({
      ...defaultSubscription,
      isEntitled: false,
      trialEligible: false,
      hasLoaded: false,
      billingProvider: null,
      stripeCustomerId: null,
      error: null,
      isLoading: false,
    })
  },

  fetchSubscription: async () => {
    const generation = subscriptionGeneration
    try {
      set({ isLoading: true, error: null })
      const data = await getSubscriptionStatus()
      if (generation !== subscriptionGeneration) return
      set({
        subscription: {
          ...data.subscription,
          autoRenewEnabled: data.autoRenewEnabled ?? data.subscription.autoRenewEnabled ?? false,
        },
        usage: data.usage,
        features: data.features,
        // Older backends omit isEntitled; any paid tier was entitled there.
        isEntitled: data.isEntitled ?? data.subscription.tier !== 'FREE',
        trialEligible: data.trialEligible ?? false,
        billingProvider: data.billingProvider,
        stripeCustomerId: data.stripeCustomerId,
        hasLoaded: true,
        isLoading: false,
      })
    } catch (err) {
      if (generation !== subscriptionGeneration) return
      const message = err instanceof Error ? err.message : 'Failed to fetch subscription'
      set({ error: message, isLoading: false })
    }
  },

  setError: (error) => set({ error }),

  refreshAfterPurchase: async () => {
    const generation = subscriptionGeneration
    // Checkout redirects can arrive before webhooks. Confirm entitlement before
    // announcing activation; a delayed webhook must never look like a payment failure.
    // A trialing subscription is a successful activation.
    for (let attempt = 0; attempt < 6; attempt++) {
      await get().fetchSubscription()
      if (generation !== subscriptionGeneration) return false
      const state = get()
      if (!state.error && state.billingProvider === 'stripe' && state.isEntitled) return true
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    return false
  },
}))

export const useIsEntitled = () => useSubscriptionStore((state) => state.isEntitled)

export const useCanExport = () => useSubscriptionStore((state) => state.features.canExport)
