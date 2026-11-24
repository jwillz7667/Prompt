import { NextResponse } from 'next/server'
import { loadCheckoutConfig } from '@/lib/stripe/config'

// Server-only env, read per request; never inlined into client bundles.
export const dynamic = 'force-dynamic'

/** Lets the upgrade page show "unavailable" up front instead of after a click. */
export function GET() {
  return NextResponse.json(
    { isCheckoutAvailable: loadCheckoutConfig().isConfigured },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
