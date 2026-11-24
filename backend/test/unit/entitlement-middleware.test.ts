import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { subscriptionInfo, generationCount, config } = vi.hoisted(() => ({
  subscriptionInfo: vi.fn(),
  generationCount: vi.fn(),
  config: {
    isHardPaywallEnabled: true,
    freeDailyPromptLimit: 10,
    premiumDailyGenerationSoftCap: 300,
    supportAiDailyLimit: 20,
    shouldAcceptSandboxTransactions: true,
  },
}));
vi.mock('../../src/services/subscriptionService.js', () => ({
  entitlementConfig: config,
  getSubscriptionInfo: subscriptionInfo,
  getGenerationCountToday: generationCount,
}));
vi.mock('../../src/services/emailService.js', () => ({
  sendDailyLimitReached: vi.fn().mockResolvedValue(undefined),
}));

import { getEntitlement, requireEntitlement } from '../../src/middleware/requireEntitlement.js';

function info(overrides: Record<string, unknown> = {}) {
  return {
    tier: 'FREE',
    status: 'ACTIVE',
    expiresAt: null,
    isTrialing: false,
    trialEndsAt: null,
    productId: null,
    environment: null,
    isEntitled: false,
    dailyPromptsUsed: 0,
    dailyPromptsLimit: 10,
    canPerformAction: true,
    features: { promptQuality: 'basic', canExport: false, maxTokensPerPrompt: 4096 },
    ...overrides,
  };
}

const app = express();
app.use((req, _res, next) => {
  if (req.header('x-user')) req.user = { id: 'user_1', email: 'a@b.test', sessionId: 's' };
  next();
});
app.post('/gated', requireEntitlement, (req, res) => {
  res.json({ tier: getEntitlement(req)?.tier, legacyQuality: req.subscription?.promptQuality });
});

beforeEach(() => {
  subscriptionInfo.mockReset();
  generationCount.mockReset().mockResolvedValue(0);
  config.isHardPaywallEnabled = true;
});

describe('requireEntitlement', () => {
  it('returns 401 when authentication did not run', async () => {
    expect((await request(app).post('/gated')).status).toBe(401);
  });

  it('resolves the subscription once and exposes it to the handler', async () => {
    subscriptionInfo.mockResolvedValue(
      info({
        tier: 'PREMIUM',
        isEntitled: true,
        features: { promptQuality: 'advanced', canExport: true, maxTokensPerPrompt: 16384 },
      }),
    );

    const response = await request(app).post('/gated').set('x-user', '1');

    expect(response.body).toEqual({ tier: 'PREMIUM', legacyQuality: 'advanced' });
    expect(subscriptionInfo).toHaveBeenCalledTimes(1);
  });

  it('falls back to the legacy daily allowance when the hard paywall is switched off', async () => {
    config.isHardPaywallEnabled = false;
    subscriptionInfo.mockResolvedValue(info({ dailyPromptsUsed: 3 }));

    expect((await request(app).post('/gated').set('x-user', '1')).status).toBe(200);
  });

  it('returns 403 QUOTA_EXCEEDED once the legacy allowance is spent', async () => {
    config.isHardPaywallEnabled = false;
    subscriptionInfo.mockResolvedValue(info({ dailyPromptsUsed: 10, canPerformAction: false }));

    const response = await request(app).post('/gated').set('x-user', '1');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'QUOTA_EXCEEDED', reason: 'DAILY_LIMIT_REACHED' });
  });

  it('returns 503 with a retryable code when the subscription lookup fails', async () => {
    subscriptionInfo.mockRejectedValue(new Error('connection refused'));

    const response = await request(app).post('/gated').set('x-user', '1');

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('ENTITLEMENT_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('connection refused');
  });

  it('returns 429 FAIR_USE_LIMIT at the soft cap', async () => {
    subscriptionInfo.mockResolvedValue(info({ tier: 'PREMIUM', isEntitled: true }));
    generationCount.mockResolvedValue(300);

    const response = await request(app).post('/gated').set('x-user', '1');

    expect(response.status).toBe(429);
    expect(response.body.code).toBe('FAIR_USE_LIMIT');
  });
});
