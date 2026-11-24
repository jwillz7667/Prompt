import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({
  getSubscriptionStatus: vi.fn(),
}))
vi.mock('@/lib/api/subscriptions', () => api)
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'

const free = {
  isEntitled: false,
  trialEligible: true,
  subscription: { tier: 'FREE', status: 'ACTIVE', isTrialing: false },
  usage: { dailyPromptsUsed: 0, dailyPromptsLimit: 0, canCreatePrompt: false },
  features: {},
  billingProvider: null,
}
const paid = {
  ...free,
  isEntitled: true,
  trialEligible: false,
  subscription: { ...free.subscription, tier: 'PREMIUM' },
  billingProvider: 'stripe',
  autoRenewEnabled: true,
}
const trialing = {
  ...paid,
  subscription: { ...paid.subscription, isTrialing: true },
}
beforeEach(() => {
  vi.resetAllMocks()
  useSubscriptionStore.getState().reset()
})
afterEach(() => vi.useRealTimers())

it('does not report activation until the webhook grants Premium', async () => {
  vi.useFakeTimers()
  api.getSubscriptionStatus.mockResolvedValueOnce(free).mockResolvedValue(paid)
  const pending = useSubscriptionStore.getState().refreshAfterPurchase()
  await vi.advanceTimersByTimeAsync(2100)
  expect(await pending).toBe(true)
  expect(api.getSubscriptionStatus).toHaveBeenCalledTimes(2)
  expect(useSubscriptionStore.getState().subscription.autoRenewEnabled).toBe(true)
})
it('leaves delayed payments pending instead of claiming success', async () => {
  vi.useFakeTimers()
  api.getSubscriptionStatus.mockResolvedValue(free)
  const pending = useSubscriptionStore.getState().refreshAfterPurchase()
  await vi.advanceTimersByTimeAsync(11000)
  expect(await pending).toBe(false)
})
it('discards a paid response received after account reset', async () => {
  let finish!: (value: unknown) => void
  api.getSubscriptionStatus.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const pending = useSubscriptionStore.getState().fetchSubscription()
  useSubscriptionStore.getState().reset()
  finish(paid)
  await pending
  expect(useSubscriptionStore.getState().subscription.tier).toBe('FREE')
})
it('reports a trialing web subscription as activated', async () => {
  api.getSubscriptionStatus.mockResolvedValue(trialing)

  expect(await useSubscriptionStore.getState().refreshAfterPurchase()).toBe(true)
})
it('records trial eligibility and entitlement from the status response', async () => {
  api.getSubscriptionStatus.mockResolvedValue(free)

  await useSubscriptionStore.getState().fetchSubscription()

  expect(useSubscriptionStore.getState()).toMatchObject({
    isEntitled: false,
    trialEligible: true,
    hasLoaded: true,
  })
})
