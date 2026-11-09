import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const stripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  subscriptions: { list: vi.fn(), retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn(), list: vi.fn(), expire: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
}))
vi.mock('stripe', () => ({ default: class { constructor() { return stripe } } }))
import { POST as checkout } from '@/app/api/stripe/checkout/route'
import { POST as webhook } from '@/app/api/stripe/webhook/route'
import { POST as portal } from '@/app/api/stripe/portal/route'

const fetchMock = vi.fn()
const subscription = {
  id: 'sub_1', customer: 'cus_1', metadata: { userId: 'user_1' }, status: 'active',
  items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1900000000 }] },
  cancel_at_period_end: false,
}
const request = () => new NextRequest('https://app.test/api/stripe/checkout', {
  method: 'POST', headers: { authorization: 'Bearer access', 'content-type': 'application/json' },
  body: JSON.stringify({ priceId: 'price_pro' }),
})
const webhookRequest = () => new NextRequest('https://app.test/api/stripe/webhook', {
  method: 'POST', headers: { 'stripe-signature': 'signature' }, body: '{}',
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('STRIPE_SECRET_KEY', 'test-only')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-only')
  vi.stubEnv('BACKEND_WEBHOOK_SECRET', 'test-only')
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY', 'price_pro')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')
  stripe.customers.create.mockResolvedValue({ id: 'cus_1' })
  stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/session' })
  stripe.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/session' })
  stripe.subscriptions.retrieve.mockResolvedValue(subscription)
  stripe.subscriptions.list.mockResolvedValue({ data: [] })
  stripe.checkout.sessions.list.mockResolvedValue({ data: [] })
  stripe.checkout.sessions.expire.mockResolvedValue({})
})

function account(status: object = { stripeCustomerId: null }) {
  fetchMock.mockResolvedValueOnce(Response.json({ user: { id: 'user_1', email: 'test@example.com', name: 'Test' } }))
  fetchMock.mockResolvedValueOnce(Response.json(status))
}

describe('consumer checkout', () => {
  it('unwraps auth/me and ties both Checkout and subscription to the real account', async () => {
    account()
    expect((await checkout(request())).status).toBe(200)
    expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { userId: 'user_1' } }), expect.any(Object))
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      client_reference_id: 'user_1', metadata: { userId: 'user_1', priceId: 'price_pro' }, subscription_data: { metadata: { userId: 'user_1' } },
    }), { idempotencyKey: 'promptomize-checkout-cus_1-initial' })
  })
  it('fails closed if billing status cannot be loaded', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user: { id: 'user_1' } }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    expect((await checkout(request())).status).toBe(503)
    expect(stripe.customers.create).not.toHaveBeenCalled()
  })
  it('routes existing paid customers to the portal instead of charging twice', async () => {
    account({ stripeCustomerId: 'cus_1' })
    stripe.subscriptions.list.mockResolvedValue({ data: [subscription] })
    expect(await (await checkout(request())).json()).toEqual({ url: 'https://billing.stripe.com/session' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
  it('prevents a second platform purchase while Apple subscription is active', async () => {
    account({ billingProvider: 'appstore', subscription: { tier: 'PRO' } })
    expect((await checkout(request())).status).toBe(409)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
  it('checks pending subscriptions even before the customer webhook arrives', async () => {
    account()
    stripe.subscriptions.list.mockResolvedValue({ data: [subscription] })
    expect((await checkout(request())).status).toBe(200)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
  it('reuses an open checkout for the same plan', async () => {
    account()
    stripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_open', mode: 'subscription', status: 'open', url: 'https://checkout.stripe.com/open', metadata: { userId: 'user_1', priceId: 'price_pro' } }] })
    expect(await (await checkout(request())).json()).toEqual({ sessionId: 'cs_open', url: 'https://checkout.stripe.com/open' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
  it('keeps a stable idempotency key and payload for competing first requests', async () => {
    account()
    await checkout(request())
    account()
    await checkout(request())
    expect(stripe.checkout.sessions.create.mock.calls[0]).toEqual(stripe.checkout.sessions.create.mock.calls[1])
  })
  it('opens Apple subscription management for an App Store subscriber', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ billingProvider: 'appstore' }))
    expect(await (await portal(request())).json()).toEqual({ url: 'https://apps.apple.com/account/subscriptions' })
  })
})

describe('signed webhook relay', () => {
  it('rejects invalid signatures without contacting the backend', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('invalid') })
    expect((await webhook(webhookRequest())).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('reconciles current Stripe state and sends the real event ID + item billing period', async () => {
    stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_1', created: 1800000000, type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'past_due' } } })
    fetchMock.mockResolvedValue(Response.json({ success: true }))
    expect((await webhook(webhookRequest())).status).toBe(200)
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.data).toMatchObject({ stripeEventId: 'evt_1', eventCreated: 1800000000, userId: 'user_1', stripeCustomerId: 'cus_1', status: 'active', currentPeriodEnd: new Date(1900000000 * 1000).toISOString() })
  })
  it('returns 500 so Stripe retries a failed backend write', async () => {
    stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_1', created: 1800000000, type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } })
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    expect((await webhook(webhookRequest())).status).toBe(500)
  })
  it('restores access on invoice.paid using the new invoice subscription shape', async () => {
    stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_2', created: 1800000000, type: 'invoice.paid', data: { object: { parent: { subscription_details: { subscription: 'sub_1' } } } } })
    fetchMock.mockResolvedValue(Response.json({ success: true }))
    expect((await webhook(webhookRequest())).status).toBe(200)
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).event).toBe('subscription.updated')
  })
  it('ignores separate enterprise subscriptions', async () => {
    stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_2', created: 1800000000, type: 'customer.subscription.updated', data: { object: { id: 'sub_api' } } })
    stripe.subscriptions.retrieve.mockResolvedValue({ ...subscription, metadata: { developerId: 'developer_1' } })
    expect((await webhook(webhookRequest())).status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
