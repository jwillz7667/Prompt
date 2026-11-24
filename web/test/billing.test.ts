import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const stripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  subscriptions: { list: vi.fn(), retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn(), list: vi.fn(), expire: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
}))
vi.mock('stripe', () => ({
  default: class {
    constructor() {
      return stripe
    }
  },
}))
import { POST as checkout } from '@/app/api/stripe/checkout/route'
import { POST as webhook } from '@/app/api/stripe/webhook/route'
import { POST as portal } from '@/app/api/stripe/portal/route'
import { GET as billingConfig } from '@/app/api/stripe/config/route'

const PREMIUM_PRICE = 'price_premium_monthly'
const LEGACY_PRO_PRICE = 'price_legacy_pro_annual'

const fetchMock = vi.fn()
const subscription = {
  id: 'sub_1',
  customer: 'cus_1',
  metadata: { userId: 'user_1' },
  status: 'active',
  trial_start: null,
  items: { data: [{ price: { id: PREMIUM_PRICE }, current_period_end: 1900000000 }] },
  cancel_at_period_end: false,
}
const request = (body: unknown = { plan: 'premium_monthly' }) =>
  new NextRequest('https://app.test/api/stripe/checkout', {
    method: 'POST',
    headers: { authorization: 'Bearer access', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const webhookRequest = () =>
  new NextRequest('https://app.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'signature' },
    body: '{}',
  })

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_local')
  vi.stubEnv('STRIPE_PREMIUM_MONTHLY_PRICE_ID', PREMIUM_PRICE)
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_local')
  vi.stubEnv('BACKEND_WEBHOOK_SECRET', 'relay-secret')
  vi.stubEnv('STRIPE_LEGACY_CONSUMER_PRICE_IDS', LEGACY_PRO_PRICE)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')
  stripe.customers.create.mockResolvedValue({ id: 'cus_1' })
  stripe.checkout.sessions.create.mockResolvedValue({
    id: 'cs_1',
    url: 'https://checkout.stripe.com/session',
  })
  stripe.billingPortal.sessions.create.mockResolvedValue({
    url: 'https://billing.stripe.com/session',
  })
  stripe.subscriptions.retrieve.mockResolvedValue(subscription)
  stripe.subscriptions.list.mockResolvedValue({ data: [] })
  stripe.checkout.sessions.list.mockResolvedValue({ data: [] })
  stripe.checkout.sessions.expire.mockResolvedValue({})
})

function account(status: object = {}) {
  fetchMock.mockResolvedValueOnce(
    Response.json({ user: { id: 'user_1', email: 'test@example.com', name: 'Test' } }),
  )
  fetchMock.mockResolvedValueOnce(
    Response.json({
      isEntitled: false,
      trialEligible: true,
      billingProvider: null,
      stripeCustomerId: null,
      subscription: { tier: 'FREE' },
      ...status,
    }),
  )
}

const createdSession = () => stripe.checkout.sessions.create.mock.calls[0][0]

describe('consumer checkout', () => {
  it('charges the configured Premium price and ignores a client-chosen price or tier', async () => {
    account()

    const response = await checkout(
      request({ priceId: 'price_attacker_cheap', tier: 'PRO', interval: 'annual' }),
    )

    expect(response.status).toBe(200)
    expect(createdSession().line_items).toEqual([{ price: PREMIUM_PRICE, quantity: 1 }])
  })

  it('rejects a plan other than Premium monthly', async () => {
    const response = await checkout(request({ plan: 'pro_annual' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_PLAN' })
  })

  it('ties both Checkout and the subscription to the signed-in account', async () => {
    account()

    await checkout(request())

    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: 'user_1' } }),
      { idempotencyKey: 'promptomize-customer-user_1' },
    )
    expect(createdSession()).toMatchObject({
      client_reference_id: 'user_1',
      mode: 'subscription',
      payment_method_collection: 'always',
      subscription_data: { metadata: { userId: 'user_1' } },
    })
  })

  it('includes the 3-day trial for a first-time subscriber', async () => {
    account({ trialEligible: true })

    const response = await checkout(request())

    expect(createdSession().subscription_data.trial_period_days).toBe(3)
    expect(await response.json()).toMatchObject({ includesTrial: true })
  })

  it('omits the trial when the backend says the account already used one', async () => {
    account({ trialEligible: false })

    await checkout(request())

    expect(createdSession().subscription_data).not.toHaveProperty('trial_period_days')
  })

  it('omits the trial when Stripe shows an earlier, canceled subscription', async () => {
    account({ trialEligible: true, stripeCustomerId: 'cus_1' })
    stripe.subscriptions.list.mockResolvedValue({
      data: [{ ...subscription, status: 'canceled' }],
    })

    await checkout(request())

    expect(createdSession().subscription_data).not.toHaveProperty('trial_period_days')
  })

  it('keeps the trial when the only earlier attempt never completed payment', async () => {
    account({ trialEligible: true, stripeCustomerId: 'cus_1' })
    stripe.subscriptions.list.mockResolvedValue({
      data: [{ ...subscription, status: 'incomplete_expired' }],
    })

    await checkout(request())

    expect(createdSession().subscription_data.trial_period_days).toBe(3)
  })

  it('returns 409 ALREADY_SUBSCRIBED for an active App Store subscriber', async () => {
    account({ isEntitled: true, billingProvider: 'appstore', subscription: { tier: 'PREMIUM' } })

    const response = await checkout(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
      billingProvider: 'appstore',
    })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 409 for an App Store subscriber in billing grace', async () => {
    account({ isEntitled: false, billingProvider: 'appstore', subscription: { tier: 'PREMIUM' } })

    expect((await checkout(request())).status).toBe(409)
  })

  it('returns 409 for a live Stripe subscription even before its webhook arrives', async () => {
    account()
    stripe.subscriptions.list.mockResolvedValue({ data: [{ ...subscription, status: 'trialing' }] })

    const response = await checkout(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ billingProvider: 'stripe' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 503 BILLING_NOT_CONFIGURED without contacting the backend or Stripe', async () => {
    vi.stubEnv('STRIPE_PREMIUM_MONTHLY_PRICE_ID', '')

    const response = await checkout(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'BILLING_NOT_CONFIGURED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a missing Stripe secret key as not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')

    expect(await (await checkout(request())).json()).toMatchObject({
      code: 'BILLING_NOT_CONFIGURED',
    })
  })

  it('fails closed if billing status cannot be loaded', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ user: { id: 'user_1' } }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))

    expect((await checkout(request())).status).toBe(503)
    expect(stripe.customers.create).not.toHaveBeenCalled()
  })

  it('reuses an open checkout for the same offer', async () => {
    account()
    stripe.checkout.sessions.list.mockResolvedValue({
      data: [
        {
          id: 'cs_open',
          mode: 'subscription',
          status: 'open',
          url: 'https://checkout.stripe.com/open',
          metadata: { userId: 'user_1', variant: `${PREMIUM_PRICE}:trial` },
        },
      ],
    })

    expect(await (await checkout(request())).json()).toMatchObject({
      sessionId: 'cs_open',
      url: 'https://checkout.stripe.com/open',
    })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('expires an open checkout for a different offer before creating a new one', async () => {
    account({ trialEligible: false })
    stripe.checkout.sessions.list.mockResolvedValue({
      data: [
        {
          id: 'cs_old',
          mode: 'subscription',
          status: 'open',
          url: 'https://checkout.stripe.com/old',
          metadata: { userId: 'user_1', variant: `${PREMIUM_PRICE}:trial` },
        },
      ],
    })

    await checkout(request())

    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_old')
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
  })

  it('sends a stable idempotency key and payload for competing first requests', async () => {
    account()
    await checkout(request())
    account()
    await checkout(request())

    expect(stripe.checkout.sessions.create.mock.calls[0]).toEqual(
      stripe.checkout.sessions.create.mock.calls[1],
    )
    expect(stripe.checkout.sessions.create.mock.calls[0][1]).toEqual({
      idempotencyKey: `promptomize-checkout-cus_1-initial-${PREMIUM_PRICE}:trial`,
    })
  })
})

describe('billing portal', () => {
  it('opens the Stripe portal for a web subscriber', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ billingProvider: 'stripe', stripeCustomerId: 'cus_1' }),
    )

    expect(await (await portal(request())).json()).toEqual({
      provider: 'stripe',
      url: 'https://billing.stripe.com/session',
    })
  })

  it('points an App Store subscriber to Apple subscription settings', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ billingProvider: 'appstore' }))

    const body = await (await portal(request())).json()

    expect(body).toMatchObject({ provider: 'appstore' })
    expect(body.instructions).toContain('Settings > Apple Account > Subscriptions')
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 503 BILLING_NOT_CONFIGURED for a web subscriber when Stripe is unset', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    fetchMock.mockResolvedValueOnce(
      Response.json({ billingProvider: 'stripe', stripeCustomerId: 'cus_1' }),
    )

    const response = await portal(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'BILLING_NOT_CONFIGURED' })
  })
})

describe('billing config', () => {
  it('reports checkout unavailable when the Premium price is not set', async () => {
    vi.stubEnv('STRIPE_PREMIUM_MONTHLY_PRICE_ID', '')

    expect(await billingConfig().json()).toEqual({ isCheckoutAvailable: false })
  })

  it('reports checkout available when Stripe is configured', async () => {
    expect(await billingConfig().json()).toEqual({ isCheckoutAvailable: true })
  })
})

describe('signed webhook relay', () => {
  function updatedEvent() {
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      created: 1800000000,
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1' } },
    })
  }
  const relayed = () => JSON.parse(fetchMock.mock.calls[0][1].body)

  it('rejects invalid signatures without contacting the backend', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('invalid')
    })

    expect((await webhook(webhookRequest())).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 503 when the webhook secrets are not configured', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')

    expect((await webhook(webhookRequest())).status).toBe(503)
  })

  it('reconciles current Stripe state and sends the real event ID + item billing period', async () => {
    updatedEvent()
    fetchMock.mockResolvedValue(Response.json({ success: true }))

    expect((await webhook(webhookRequest())).status).toBe(200)
    expect(relayed().data).toMatchObject({
      stripeEventId: 'evt_1',
      eventCreated: 1800000000,
      userId: 'user_1',
      stripeCustomerId: 'cus_1',
      status: 'active',
      tier: 'PREMIUM',
      hadTrial: false,
      currentPeriodEnd: new Date(1900000000 * 1000).toISOString(),
    })
  })

  it('reports a trialing subscription so the backend burns the trial', async () => {
    updatedEvent()
    stripe.subscriptions.retrieve.mockResolvedValue({
      ...subscription,
      status: 'trialing',
      trial_start: 1800000000,
    })
    fetchMock.mockResolvedValue(Response.json({ success: true }))

    await webhook(webhookRequest())

    expect(relayed().data).toMatchObject({ status: 'trialing', hadTrial: true })
  })

  it('keeps a legacy Pro subscriber Premium', async () => {
    updatedEvent()
    stripe.subscriptions.retrieve.mockResolvedValue({
      ...subscription,
      items: { data: [{ price: { id: LEGACY_PRO_PRICE }, current_period_end: 1900000000 }] },
    })
    fetchMock.mockResolvedValue(Response.json({ success: true }))

    expect((await webhook(webhookRequest())).status).toBe(200)
    expect(relayed().data).toMatchObject({ stripePriceId: LEGACY_PRO_PRICE, tier: 'PREMIUM' })
  })

  it('returns 500 so Stripe retries a failed backend write', async () => {
    updatedEvent()
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))

    expect((await webhook(webhookRequest())).status).toBe(500)
  })

  it('restores access on invoice.paid using the new invoice subscription shape', async () => {
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_2',
      created: 1800000000,
      type: 'invoice.paid',
      data: { object: { parent: { subscription_details: { subscription: 'sub_1' } } } },
    })
    fetchMock.mockResolvedValue(Response.json({ success: true }))

    expect((await webhook(webhookRequest())).status).toBe(200)
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
    expect(relayed().event).toBe('subscription.updated')
  })

  it('ignores separate developer API subscriptions', async () => {
    updatedEvent()
    stripe.subscriptions.retrieve.mockResolvedValue({
      ...subscription,
      metadata: { developerId: 'developer_1' },
    })

    expect((await webhook(webhookRequest())).status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
