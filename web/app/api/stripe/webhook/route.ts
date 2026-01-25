import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'
const BACKEND_WEBHOOK_SECRET = process.env.BACKEND_WEBHOOK_SECRET || ''

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-02-24.acacia',
  })
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      )
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutComplete(session)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdate(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(subscription)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await handlePaymentFailed(invoice)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const stripe = getStripe()
  const userId = session.metadata?.userId
  const subscriptionId = session.subscription as string
  const customerId = session.customer as string

  if (!userId || !subscriptionId) {
    console.error('Missing userId or subscriptionId in checkout session')
    return
  }

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const priceId = subscription.items.data[0]?.price.id

  // Determine tier from price ID
  let tier = 'PRO'
  if (priceId.includes('premium')) {
    tier = 'PREMIUM'
  }

  // Notify backend
  await notifyBackend('subscription.created', {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId: priceId,
    tier,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  })
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId
  const priceId = subscription.items.data[0]?.price.id

  if (!userId) {
    console.error('Missing userId in subscription metadata')
    return
  }

  // Determine tier from price ID
  let tier = 'PRO'
  if (priceId.includes('premium')) {
    tier = 'PREMIUM'
  }

  await notifyBackend('subscription.updated', {
    userId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    tier,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  })
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId

  if (!userId) {
    console.error('Missing userId in subscription metadata')
    return
  }

  await notifyBackend('subscription.deleted', {
    userId,
    stripeSubscriptionId: subscription.id,
  })
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const stripe = getStripe()
  const customerId = invoice.customer as string

  // Get customer to find userId
  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted) return

  const userId = (customer as Stripe.Customer).metadata?.userId

  if (!userId) {
    console.error('Missing userId in customer metadata')
    return
  }

  await notifyBackend('payment.failed', {
    userId,
    invoiceId: invoice.id,
  })
}

async function notifyBackend(event: string, data: Record<string, unknown>) {
  try {
    const response = await fetch(`${API_BASE_URL}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': BACKEND_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ event, data }),
    })

    if (!response.ok) {
      console.error('Failed to notify backend:', await response.text())
    }
  } catch (error) {
    console.error('Error notifying backend:', error)
  }
}
