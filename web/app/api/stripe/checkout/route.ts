import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { appOrigin, fetchAccount, stripeClient, tierForPrice } from '@/lib/stripe/server'

const checkoutSchema = z.object({ priceId: z.string().min(1) })

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return NextResponse.json({ error: 'Please sign in to subscribe' }, { status: 401 })
    const input = checkoutSchema.safeParse(await request.json().catch(() => null))
    if (!input.success || !tierForPrice(input.data.priceId)) {
      return NextResponse.json({ error: 'This plan is not available. Please contact support.' }, { status: 400 })
    }

    const [userResponse, statusResponse] = await Promise.all([
      fetchAccount('/auth/me', token), fetchAccount('/subscriptions/status', token),
    ])
    if ([userResponse.status, statusResponse.status].includes(401)) {
      return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
    }
    if (!userResponse.ok || !statusResponse.ok) {
      return NextResponse.json({ error: 'Unable to verify your billing account. Please try again.' }, { status: 503 })
    }
    const { user } = await userResponse.json()
    const status = await statusResponse.json()
    if (!user?.id) throw new Error('Invalid account response')
    const origin = appOrigin(request)
    const stripe = stripeClient()
    if (status.billingProvider === 'appstore' && status.subscription?.tier !== 'FREE') {
      return NextResponse.json({ error: 'Manage your existing subscription in Apple subscription settings.' }, { status: 409 })
    }

    let customerId: string = status.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        metadata: { userId: user.id },
      }, { idempotencyKey: `promptomize-customer-${user.id}` })
      customerId = customer.id
    }

    // Check Stripe even before the first webhook has persisted the customer ID.
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
    const existing = subscriptions.data.some(sub =>
      !['canceled', 'incomplete_expired'].includes(sub.status) &&
      sub.items.data.some(item => tierForPrice(item.price.id)))
    if (existing) {
      const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/upgrade` })
      return NextResponse.json({ url: portal.url })
    }

    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 10 })
    const previous = sessions.data.find(session => session.mode === 'subscription' && session.metadata?.userId === user.id)
    if (previous?.status === 'open' && previous.url) {
      if (previous.metadata?.priceId === input.data.priceId) {
        return NextResponse.json({ sessionId: previous.id, url: previous.url })
      }
      // Changing plans invalidates the prior payment link before creating another.
      // If payment won the race, expiration fails and the customer must retry.
      await stripe.checkout.sessions.expire(previous.id)
    }
    const intentKey = `promptomize-checkout-${customerId}-${previous?.id || 'initial'}`
    const identifier = [...createHash('sha256').update(intentKey).digest().subarray(0, 8)]
      .map(value => String.fromCharCode(97 + value % 26)).join('')

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: input.data.priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/upgrade?checkout=canceled`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      integration_identifier: `promptomize_web_${identifier}`,
      metadata: { userId: user.id, priceId: input.data.priceId },
      subscription_data: { metadata: { userId: user.id } },
    }, { idempotencyKey: intentKey })
    if (!session.url) throw new Error('Checkout URL unavailable')
    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch {
    return NextResponse.json({ error: 'Unable to start checkout. Please try again shortly.' }, { status: 503 })
  }
}
