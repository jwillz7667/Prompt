import { describe, expect, it } from 'vitest';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';

import {
  getTierFromProductId,
  isEntitled,
  isSandboxTrustedAccount,
  parseEntitlementConfig,
  type EntitlementState,
} from '../../src/services/subscriptionService.js';

const NOW = new Date('2026-11-24T12:00:00Z');
const FUTURE = new Date('2026-11-25T12:00:00Z');
const PAST = new Date('2026-11-23T12:00:00Z');

function state(overrides: Partial<EntitlementState> = {}): EntitlementState {
  return {
    tier: SubscriptionTier.PREMIUM,
    status: SubscriptionStatus.ACTIVE,
    expiresAt: FUTURE,
    environment: 'Production',
    isSandboxTrusted: true,
    ...overrides,
  };
}

describe('isEntitled', () => {
  it('entitles an active paid subscription that has not expired', () => {
    expect(isEntitled(state(), NOW)).toBe(true);
  });

  it('entitles a subscription in its billing grace period', () => {
    expect(isEntitled(state({ status: SubscriptionStatus.GRACE_PERIOD }), NOW)).toBe(true);
  });

  it.each([
    ['the FREE tier', { tier: SubscriptionTier.FREE }],
    ['a canceled subscription', { status: SubscriptionStatus.CANCELED }],
    ['an expired status', { status: SubscriptionStatus.EXPIRED }],
    ['a past expiry', { expiresAt: PAST }],
    ['a missing expiry', { expiresAt: null }],
  ])('denies %s', (_label, overrides) => {
    expect(isEntitled(state(overrides), NOW)).toBe(false);
  });

  it('accepts sandbox subscriptions on a trusted account by default', () => {
    expect(isEntitled(state({ environment: 'Sandbox' }), NOW)).toBe(true);
  });

  it('denies a sandbox subscription on an account that is not trusted for sandbox purchases', () => {
    expect(isEntitled(state({ environment: 'Sandbox', isSandboxTrusted: false }), NOW)).toBe(false);
  });

  it('ignores sandbox trust for production subscriptions', () => {
    expect(isEntitled(state({ isSandboxTrusted: false }), NOW)).toBe(true);
  });
});

describe('isSandboxTrustedAccount', () => {
  const config = { sandboxAccountMaxAgeDays: 14, sandboxAllowedUserIds: new Set(['tester_1']) };
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

  it('trusts a recently created account such as an App Review sign-in', () => {
    expect(isSandboxTrustedAccount('user_new', daysAgo(2), NOW, config)).toBe(true);
  });

  it('does not trust a long-standing account', () => {
    expect(isSandboxTrustedAccount('user_old', daysAgo(30), NOW, config)).toBe(false);
  });

  it('always trusts an allow-listed internal tester', () => {
    expect(isSandboxTrustedAccount('tester_1', daysAgo(400), NOW, config)).toBe(true);
  });
});

describe('getTierFromProductId', () => {
  it.each([
    'com.promptomizer.premium.monthly',
    'com.promptomizer.premium.annual',
    'com.promptomizer.pro.monthly',
    'com.promptomizer.pro.annual',
  ])('maps grandfathered product %s to PREMIUM', (productId) => {
    expect(getTierFromProductId(productId)).toBe(SubscriptionTier.PREMIUM);
  });

  it('maps an unknown product to FREE', () => {
    expect(getTierFromProductId('com.example.other')).toBe(SubscriptionTier.FREE);
  });
});

describe('parseEntitlementConfig', () => {
  it('defaults to a hard paywall with documented limits', () => {
    expect(parseEntitlementConfig({})).toEqual({
      isHardPaywallEnabled: true,
      freeDailyPromptLimit: 10,
      premiumDailyGenerationSoftCap: 300,
      supportAiDailyLimit: 20,
      shouldAcceptSandboxTransactions: true,
      sandboxAccountMaxAgeDays: 14,
      sandboxAllowedUserIds: new Set(),
    });
  });

  it('parses the sandbox tester allow-list', () => {
    expect(
      parseEntitlementConfig({ APPLE_SANDBOX_ALLOWED_USER_IDS: ' user_a, ,user_b ' }).sandboxAllowedUserIds,
    ).toEqual(new Set(['user_a', 'user_b']));
  });

  it('treats blank values as unset', () => {
    expect(parseEntitlementConfig({ HARD_PAYWALL_ENABLED: ' ' }).isHardPaywallEnabled).toBe(true);
  });

  it('reads the rollback flag and numeric limits', () => {
    expect(
      parseEntitlementConfig({
        HARD_PAYWALL_ENABLED: 'false',
        FREE_DAILY_PROMPT_LIMIT: '5',
        APPLE_ACCEPT_SANDBOX_TRANSACTIONS: 'false',
      }),
    ).toMatchObject({
      isHardPaywallEnabled: false,
      freeDailyPromptLimit: 5,
      shouldAcceptSandboxTransactions: false,
    });
  });

  it('rejects a malformed flag instead of guessing', () => {
    expect(() => parseEntitlementConfig({ HARD_PAYWALL_ENABLED: 'yes' })).toThrow();
  });
});

