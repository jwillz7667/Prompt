import { describe, expect, it } from 'vitest'
import {
  describeEnhanceFailure,
  getDeveloperPlanAccess,
  getQuotaUsedPercent,
  toPlaygroundRequestBody,
} from '@/lib/developer/plan-access'

describe('developer plan access', () => {
  it('requires an upgrade for a free account', () => {
    const access = getDeveloperPlanAccess({
      tier: 'API_FREE',
      status: 'ACTIVE',
      canMakeRequests: false,
      hasActivePaidPlan: false,
    })

    expect(access).toEqual({
      canEnhance: false,
      isUpgradeRequired: true,
      upgradeUrl: '/developers/billing',
    })
  })

  it('requires an upgrade for a past-due paid plan reported by an older backend', () => {
    const access = getDeveloperPlanAccess({
      tier: 'API_PRO',
      status: 'PAST_DUE',
      canMakeRequests: true,
    })

    expect(access.isUpgradeRequired).toBe(true)
  })

  it('lets an active paid plan with quota enhance', () => {
    const access = getDeveloperPlanAccess({
      tier: 'API_STARTER',
      status: 'ACTIVE',
      canMakeRequests: true,
      hasActivePaidPlan: true,
    })

    expect(access).toMatchObject({ canEnhance: true, isUpgradeRequired: false })
  })

  it('does not nag before the subscription status has loaded', () => {
    expect(getDeveloperPlanAccess(undefined).isUpgradeRequired).toBe(false)
  })
})

describe('quota bar', () => {
  it('renders an empty bar for a zero limit instead of NaN', () => {
    expect(getQuotaUsedPercent({ used: 0, limit: 0 })).toBe(0)
  })

  it('caps usage at 100 percent', () => {
    expect(getQuotaUsedPercent({ used: 1500, limit: 1000 })).toBe(100)
  })
})

describe('playground request body', () => {
  it('folds tone and length into customInstructions', () => {
    const body = toPlaygroundRequestBody({
      prompt: '  Write a launch email  ',
      modality: 'text',
      tone: 'casual',
      length: 'concise',
    })

    expect(body).toEqual({
      prompt: 'Write a launch email',
      modality: 'text',
      customInstructions: 'Use a casual tone. Keep the result concise.',
    })
  })

  it('omits customInstructions when no tone or length is chosen', () => {
    const body = toPlaygroundRequestBody({
      prompt: 'Draw a fox',
      modality: 'image',
      tone: '',
      length: '',
    })

    expect(body).toEqual({ prompt: 'Draw a fox', modality: 'image' })
  })
})

describe('enhance failure copy', () => {
  it('points a 402 API_PLAN_REQUIRED response at the plans', () => {
    const failure = describeEnhanceFailure(402, {
      error: 'A paid API plan is required',
      code: 'API_PLAN_REQUIRED',
      upgradeUrl: '/developers/billing',
    })

    expect(failure.isUpgradeRequired).toBe(true)
  })

  it('shows the API message for other failures', () => {
    const failure = describeEnhanceFailure(401, {
      error: 'Invalid API key',
      message: 'The provided API key is invalid',
    })

    expect(failure).toEqual({
      message: 'The provided API key is invalid',
      isUpgradeRequired: false,
    })
  })
})
