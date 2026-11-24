import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  clearTokens,
  getAccessToken,
  isSubscriptionRequired,
  refreshAccessToken,
  setTokens,
  SubscriptionRequiredError,
} from '@/lib/api/client'
import { getCurrentUser, logout } from '@/lib/api/auth'

const fetchMock = vi.fn()
beforeEach(() => {
  clearTokens()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('authentication and streaming', () => {
  it('unwraps the current user response', async () => {
    setTokens('access', undefined, 900)
    fetchMock.mockResolvedValue(Response.json({ user: { id: 'user_1' } }))
    expect(await getCurrentUser()).toEqual({ id: 'user_1' })
  })
  it('refreshes expired checkout auth and keeps the request on the same origin', async () => {
    setTokens('old', undefined, -1)
    fetchMock.mockResolvedValueOnce(Response.json({ accessToken: 'new', expiresIn: 900 }))
    fetchMock.mockResolvedValueOnce(Response.json({ url: 'https://checkout.stripe.com/test' }))
    await api.post('/api/stripe/checkout', { plan: 'premium_monthly' }, { local: true })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/stripe/checkout')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new')
  })
  it('keeps the session during transient refresh outages', async () => {
    setTokens('old', undefined, -1)
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    await expect(api.get('/auth/me')).rejects.toThrow('temporarily unavailable')
    expect(getAccessToken()).toBe('old')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not revive a session if a refresh finishes after logout', async () => {
    let finish!: (value: Response) => void
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
    )
    const pending = refreshAccessToken()
    clearTokens()
    finish(Response.json({ accessToken: 'stale', expiresIn: 900 }))
    expect(await pending).toBeNull()
    expect(getAccessToken()).toBeNull()
  })
  it('clears the HttpOnly refresh cookie through the local logout endpoint', async () => {
    setTokens('access', undefined, 900)
    fetchMock.mockResolvedValue(Response.json({ success: true }))
    await logout()
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/logout')
    expect(getAccessToken()).toBeNull()
  })
  it('passes cancellation to fetch and cancels the reader on early exit', async () => {
    setTokens('access', undefined, 900)
    const cancel = vi.fn()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"token","content":"hi"}\n\n'))
      },
      cancel,
    })
    fetchMock.mockResolvedValue(new Response(body))
    const controller = new AbortController()
    const stream = api.stream('/prompts/enhance/stream', {}, controller.signal)
    expect((await stream.next()).value).toContain('token')
    await stream.return()
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
    expect(cancel).toHaveBeenCalled()
  })
})

it('does not let a stale 401 clear the next account session', async () => {
  setTokens('account-a', undefined, 900)
  let finish!: (value: Response) => void
  fetchMock.mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      finish = resolve
    }),
  )
  const pending = api.get('/auth/me')
  setTokens('account-b', undefined, 900)
  finish(new Response('', { status: 401 }))
  await expect(pending).rejects.toThrow('session changed')
  expect(getAccessToken()).toBe('account-b')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('does not let an old refresh rejection clear a new login', async () => {
  setTokens('account-a', undefined, 900)
  fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
  let finish!: (value: Response) => void
  fetchMock.mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      finish = resolve
    }),
  )
  const pending = api.get('/auth/me')
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  setTokens('account-b', undefined, 900)
  finish(new Response('', { status: 401 }))
  await expect(pending).rejects.toMatchObject({ statusCode: 401 })
  expect(getAccessToken()).toBe('account-b')
})

describe('hard paywall responses', () => {
  const paywallBody = {
    error: 'Subscription required',
    code: 'QUOTA_EXCEEDED',
    reason: 'SUBSCRIPTION_REQUIRED',
    remainingQuota: 0,
  }

  it('throws SubscriptionRequiredError for a 403 SUBSCRIPTION_REQUIRED request', async () => {
    setTokens('access', undefined, 900)
    fetchMock.mockResolvedValue(Response.json(paywallBody, { status: 403 }))

    const failure = await api.post('/prompts/enhance', {}).catch((error: unknown) => error)

    expect(isSubscriptionRequired(failure)).toBe(true)
  })

  it('throws SubscriptionRequiredError before an enhancement stream starts', async () => {
    setTokens('access', undefined, 900)
    fetchMock.mockResolvedValue(Response.json(paywallBody, { status: 403 }))

    await expect(api.stream('/prompts/enhance/stream', {}).next()).rejects.toBeInstanceOf(
      SubscriptionRequiredError,
    )
  })

  it('keeps other 403 responses as ordinary API errors', async () => {
    setTokens('access', undefined, 900)
    fetchMock.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

    const failure = await api.get('/admin/tickets').catch((error: unknown) => error)

    expect(isSubscriptionRequired(failure)).toBe(false)
    expect(failure).toMatchObject({ statusCode: 403, error: 'Forbidden' })
  })

  it('preserves the billing error code from a local Stripe route', async () => {
    setTokens('access', undefined, 900)
    fetchMock.mockResolvedValue(
      Response.json({ error: 'Unavailable', code: 'BILLING_NOT_CONFIGURED' }, { status: 503 }),
    )

    const failure = await api
      .post('/api/stripe/checkout', {}, { local: true })
      .catch((error: unknown) => error)

    expect(failure).toMatchObject({ statusCode: 503, code: 'BILLING_NOT_CONFIGURED' })
  })
})
