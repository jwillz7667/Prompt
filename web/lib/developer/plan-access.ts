import type { ApiSubscriptionStatus } from '@/lib/api/apiKeys'

/**
 * Prompt enhancement through the developer API needs an active paid plan.
 * Free accounts keep keys, docs and the read-only endpoints; /public/enhance
 * answers 402 API_PLAN_REQUIRED for them.
 */
export const DEVELOPER_BILLING_PATH = '/developers/billing'

export interface DeveloperPlanAccess {
  canEnhance: boolean
  isUpgradeRequired: boolean
  upgradeUrl: string
}

export function getDeveloperPlanAccess(
  status:
    | Pick<ApiSubscriptionStatus, 'tier' | 'status' | 'canMakeRequests' | 'hasActivePaidPlan'>
    | undefined,
): DeveloperPlanAccess {
  if (!status) {
    return { canEnhance: false, isUpgradeRequired: false, upgradeUrl: DEVELOPER_BILLING_PATH }
  }

  const hasActivePaidPlan =
    status.hasActivePaidPlan ?? (status.tier !== 'API_FREE' && status.status === 'ACTIVE')

  return {
    canEnhance: hasActivePaidPlan && status.canMakeRequests,
    isUpgradeRequired: !hasActivePaidPlan,
    upgradeUrl: DEVELOPER_BILLING_PATH,
  }
}

/** Share of the monthly quota used, as a 0-100 bar width. A 0 limit is an empty bar. */
export function getQuotaUsedPercent(
  quota: Pick<ApiSubscriptionStatus['quota'], 'used' | 'limit'> | undefined,
): number {
  if (!quota || quota.limit === 'unlimited' || quota.limit <= 0) {
    return 0
  }
  return Math.min((quota.used / quota.limit) * 100, 100)
}

export interface PlaygroundRequestInput {
  prompt: string
  modality: string
  tone: string
  length: string
}

export interface PlaygroundRequestBody {
  prompt: string
  modality: string
  customInstructions?: string
}

/**
 * /public/enhance has no tone or length fields, so the playground folds them
 * into customInstructions instead of sending fields the API ignores.
 */
export function toPlaygroundRequestBody(input: PlaygroundRequestInput): PlaygroundRequestBody {
  const instructions = [
    input.tone ? `Use a ${input.tone} tone.` : null,
    input.length ? `Keep the result ${input.length}.` : null,
  ].filter((line): line is string => line !== null)

  return {
    prompt: input.prompt.trim(),
    modality: input.modality,
    ...(instructions.length > 0 ? { customInstructions: instructions.join(' ') } : {}),
  }
}

export interface EnhanceFailure {
  message: string
  isUpgradeRequired: boolean
}

export function describeEnhanceFailure(httpStatus: number, body: unknown): EnhanceFailure {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const code = typeof fields.code === 'string' ? fields.code : undefined

  if (httpStatus === 402 || code === 'API_PLAN_REQUIRED') {
    return {
      message: 'Prompt enhancement needs a paid API plan. Choose a plan to start enhancing.',
      isUpgradeRequired: true,
    }
  }

  const message =
    (typeof fields.message === 'string' && fields.message) ||
    (typeof fields.error === 'string' && fields.error) ||
    `Request failed (${httpStatus})`
  return { message, isUpgradeRequired: false }
}
