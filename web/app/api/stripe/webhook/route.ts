import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { backendURL, invoiceSubscriptionID, stripeClient, stripeID, subscriptionPeriodEnd, tierForPrice } from '@/lib/stripe/server'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const relaySecret = process.env.BACKEND_WEBHOOK_SECRET
  if (!webhookSecret || !relaySecret) {
    return NextResponse.json({ error: 'Billing webhook is not configured' }, { status: 503 })
  }
  try {
    const stripe = stripeClient()
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret)
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    let subscriptionId: string | null = null
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription' || !session.metadata?.userId) break
        subscriptionId = stripeID(session.subscription)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        subscriptionId = (event.data.object as Stripe.Subscription).id
        break
      case 'invoice.paid':
      case 'invoice.payment_failed':
        subscriptionId = invoiceSubscriptionID(event.data.object as Stripe.Invoice)
        break
    }

    if (subscriptionId) {
      // Stripe does not guarantee event ordering. Always reconcile current state,
      // including after payment recovery, instead of replaying an old snapshot.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const userId = subscription.metadata?.userId
      if (userId) {
        const item = subscription.items.data.find(item => tierForPrice(item.price.id))
        if (!item) throw new Error('Unrecognized consumer subscription price')
        const customerId = stripeID(subscription.customer)
        if (!customerId) throw new Error('Missing subscription customer')
        const deleted = subscription.status === 'canceled'
        const response = await fetch(`${backendURL}/webhooks/stripe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': relaySecret },
          body: JSON.stringify({
            event: deleted ? 'subscription.deleted' : 'subscription.updated',
            data: {
              stripeEventId: event.id,
              eventCreated: event.created,
              userId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: item.price.id,
              tier: tierForPrice(item.price.id),
              status: subscription.status,
              ...(!deleted ? { currentPeriodEnd: new Date(subscriptionPeriodEnd(subscription) * 1000).toISOString() } : {}),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        })
        // Acknowledge only after persistence. A 5xx asks Stripe to redeliver.
        if (!response.ok) throw new Error('Subscription persistence failed')
      }
    }
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
