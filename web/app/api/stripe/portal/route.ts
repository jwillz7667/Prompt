import { NextRequest, NextResponse } from 'next/server'
import { appOrigin, fetchAccount, stripeClient } from '@/lib/stripe/server'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token)
      return NextResponse.json({ error: 'Please sign in to manage billing' }, { status: 401 })
    const response = await fetchAccount('/subscriptions/status', token)
    if (!response.ok)
      return NextResponse.json(
        { error: 'Unable to verify your billing account' },
        { status: response.status === 401 ? 401 : 503 },
      )
    const status = await response.json()
    if (status.billingProvider === 'appstore') {
      return NextResponse.json({ url: 'https://apps.apple.com/account/subscriptions' })
    }
    if (!status.stripeCustomerId)
      return NextResponse.json({ error: 'No web billing account found' }, { status: 400 })
    const session = await stripeClient().billingPortal.sessions.create({
      customer: status.stripeCustomerId,
      return_url: `${appOrigin(request)}/upgrade`,
    })
    return NextResponse.json({ url: session.url })
  } catch {
    return NextResponse.json(
      { error: 'Unable to open billing. Please try again shortly.' },
      { status: 503 },
    )
  }
}
