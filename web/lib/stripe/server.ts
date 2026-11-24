import Stripe from 'stripe'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const backendURL =
  process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d7487.up.railway.app/api/v1'

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { timeout: 15_000, maxNetworkRetries: 1 })
}

export function appOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('The application URL is not configured')
  }
  return new URL(configured || request.nextUrl.origin).origin
}

export function bearerToken(request: NextRequest): string | null {
  return request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1] ?? null
}

export type BillingErrorCode =
  | 'UNAUTHENTICATED'
  | 'BILLING_NOT_CONFIGURED'
  | 'INVALID_PLAN'
  | 'ALREADY_SUBSCRIBED'
  | 'NO_BILLING_ACCOUNT'
  | 'ACCOUNT_UNAVAILABLE'
  | 'BILLING_UNAVAILABLE'

export function billingError(
  status: number,
  code: BillingErrorCode,
  error: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ error, code, ...extra }, { status })
}

export const notConfiguredResponse = () =>
  billingError(
    503,
    'BILLING_NOT_CONFIGURED',
    'Web subscriptions are not available right now. You can subscribe in the Promptomize iOS app.',
  )

export function stripeID(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id || null
}

/** The first subscription item billed at one of the given consumer prices. */
export function consumerItem(
  subscription: Stripe.Subscription,
  consumerPriceIds: ReadonlySet<string>,
): Stripe.SubscriptionItem | undefined {
  return subscription.items.data.find((item) => consumerPriceIds.has(item.price.id))
}

export function subscriptionPeriodEnd(
  item: Stripe.SubscriptionItem,
  subscription: Stripe.Subscription,
): number {
  // Signed events from older destinations may still contain the Acacia shape.
  const legacy = subscription as Stripe.Subscription & { current_period_end?: number }
  const end = item.current_period_end ?? legacy.current_period_end
  if (!end || !Number.isFinite(end)) throw new Error('Subscription billing period is missing')
  return end
}

export function invoiceSubscriptionID(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null }
  return stripeID(invoice.parent?.subscription_details?.subscription ?? legacy.subscription)
}

export async function fetchAccount(path: string, accessToken: string): Promise<Response> {
  return fetch(`${backendURL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
}

const accountUserSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().nullish(),
    name: z.string().nullish(),
  }),
})

const billingStatusSchema = z.object({
  isEntitled: z.boolean().default(false),
  trialEligible: z.boolean().default(false),
  billingProvider: z.enum(['stripe', 'appstore']).nullable().default(null),
  stripeCustomerId: z.string().nullable().default(null),
  subscription: z.object({ tier: z.enum(['FREE', 'PRO', 'PREMIUM']) }).optional(),
})

export type AccountUser = z.infer<typeof accountUserSchema>['user']
export type BillingStatus = z.infer<typeof billingStatusSchema>

export class AccountLookupError extends Error {
  constructor(readonly reason: 'unauthenticated' | 'unavailable') {
    super(`Account lookup failed: ${reason}`)
    this.name = 'AccountLookupError'
  }
}

async function parseAccountResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (response.status === 401) throw new AccountLookupError('unauthenticated')
  if (!response.ok) throw new AccountLookupError('unavailable')
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new AccountLookupError('unavailable')
  return parsed.data
}

export async function fetchBillingStatus(accessToken: string): Promise<BillingStatus> {
  return parseAccountResponse(
    await fetchAccount('/subscriptions/status', accessToken),
    billingStatusSchema,
  )
}

export async function fetchAccountUser(accessToken: string): Promise<AccountUser> {
  const body = await parseAccountResponse(
    await fetchAccount('/auth/me', accessToken),
    accountUserSchema,
  )
  return body.user
}

export function accountLookupResponse(error: AccountLookupError): NextResponse {
  return error.reason === 'unauthenticated'
    ? billingError(401, 'UNAUTHENTICATED', 'Please sign in again')
    : billingError(
        503,
        'ACCOUNT_UNAVAILABLE',
        'Unable to verify your billing account. Please try again.',
      )
}

/** Entitled through any store, including an App Store subscription in grace. */
export function isEntitledAnywhere(status: BillingStatus): boolean {
  return (
    status.isEntitled ||
    (status.billingProvider !== null &&
      status.subscription !== undefined &&
      status.subscription.tier !== 'FREE')
  )
}
