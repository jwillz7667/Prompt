import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { cookies } from 'next/headers'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-02-24.acacia',
  })
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const { priceId, successUrl, cancelUrl } = await request.json()

    if (!priceId || !successUrl || !cancelUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get user info from backend
    const cookieStore = await cookies()
    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '')

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user info to associate with Stripe customer
    const userResponse = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to get user info' },
        { status: 401 }
      )
    }

    const user = await userResponse.json()

    // Create or retrieve Stripe customer
    let customerId: string

    // Check if user already has a Stripe customer ID (stored in backend)
    const subscriptionResponse = await fetch(`${API_BASE_URL}/subscriptions/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    let existingCustomerId: string | null = null
    if (subscriptionResponse.ok) {
      const subscriptionData = await subscriptionResponse.json()
      existingCustomerId = subscriptionData.stripeCustomerId
    }

    if (existingCustomerId) {
      customerId = existingCustomerId
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          userId: user.id,
        },
      })
      customerId = customer.id
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        userId: user.id,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
        },
      },
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
