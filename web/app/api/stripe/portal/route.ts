import { NextRequest, NextResponse } from 'next/server'
import { loadCheckoutConfig } from '@/lib/stripe/config'
import {
  AccountLookupError,
  accountLookupResponse,
  appOrigin,
  bearerToken,
  billingError,
  fetchBillingStatus,
  notConfiguredResponse,
  stripeClient,
} from '@/lib/stripe/server'
import { APP_STORE_MANAGE_INSTRUCTIONS } from '@/lib/billing/premium-plan'

export async function POST(request: NextRequest) {
  const token = bearerToken(request)
  if (!token) return billingError(401, 'UNAUTHENTICATED', 'Please sign in to manage billing')

  try {
    const status = await fetchBillingStatus(token)
    // Stripe cannot manage an App Store subscription; only the device can.
    if (status.billingProvider === 'appstore') {
      return NextResponse.json({
        provider: 'appstore',
        url: 'https://apps.apple.com/account/subscriptions',
        instructions: APP_STORE_MANAGE_INSTRUCTIONS,
      })
    }
    const configResult = loadCheckoutConfig()
    if (!configResult.isConfigured) return notConfiguredResponse()
    if (!status.stripeCustomerId) {
      return billingError(400, 'NO_BILLING_ACCOUNT', 'No web billing account found')
    }
    const session = await stripeClient(configResult.config.secretKey).billingPortal.sessions.create(
      {
        customer: status.stripeCustomerId,
        return_url: `${appOrigin(request)}/upgrade`,
      },
    )
    return NextResponse.json({ provider: 'stripe', url: session.url })
  } catch (error) {
    if (error instanceof AccountLookupError) return accountLookupResponse(error)
    console.error('Stripe billing portal failed', error)
    return billingError(
      503,
      'BILLING_UNAVAILABLE',
      'Unable to open billing. Please try again shortly.',
    )
  }
}
