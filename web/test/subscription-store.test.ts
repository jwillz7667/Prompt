import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({
  getSubscriptionStatus: vi.fn(),
}))
vi.mock('@/lib/api/subscriptions', () => api)
import { useSubscriptionStore } from '@/lib/stores/subscriptionStore'

const free = {
  subscription: { tier: 'FREE', status: 'ACTIVE', isTrialing: false },
  usage: { dailyPromptsUsed: 0, dailyPromptsLimit: 10, canCreatePrompt: true },
  features: {},
  billingProvider: null,
}
const paid = {
  ...free,
  subscription: { ...free.subscription, tier: 'PRO' },
  billingProvider: 'stripe',
  autoRenewEnabled: true,
}
beforeEach(() => {
  vi.resetAllMocks()
  useSubscriptionStore.getState().reset()
})
afterEach(() => vi.useRealTimers())

it('does not report activation until the webhook grants the paid tier', async () => {
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
