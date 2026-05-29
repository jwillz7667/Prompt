import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1'

function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-02-24.acacia',
  })
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '')

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get subscription status to find Stripe customer ID
    const subscriptionResponse = await fetch(`${API_BASE_URL}/subscriptions/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!subscriptionResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to get subscription info' },
        { status: 400 }
      )
    }

    const subscriptionData = await subscriptionResponse.json()
    const customerId = subscriptionData.stripeCustomerId

    if (!customerId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 400 }
      )
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.nextUrl.origin}/upgrade`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe portal error:', error)
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
