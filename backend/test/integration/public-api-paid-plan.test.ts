import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const llm = vi.hoisted(() => {
  // Configured so credit checkout reaches the plan check; no Stripe call is
  // made because the guard rejects before any customer or session is created.
  process.env['STRIPE_API_SECRET_KEY'] = 'sk_test_local_paid_plan';
  return { enhancePrompt: vi.fn(), enhancePromptStream: vi.fn() };
});
vi.mock('../../src/services/deepseekService.js', () => ({
  enhancePrompt: llm.enhancePrompt,
  enhancePromptStream: llm.enhancePromptStream,
  getPromptTierFromSubscription: vi.fn(),
}));

import type { ApiSubscriptionStatus, ApiTier } from '@prisma/client';
import { prisma } from '../../src/utils/prisma.js';
import { cache } from '../../src/utils/redis.js';
import { generateTokenPair } from '../../src/utils/jwt.js';
import { generateApiKey } from '../../src/services/apiKeyService.js';
import { publicApiRouter } from '../../src/routes/publicApi.js';
import { apiSubscriptionsRouter } from '../../src/routes/apiSubscriptions.js';

const app = express()
  .use(express.json())
  .use('/api/v1/public', publicApiRouter)
  .use('/api/v1/api-subscriptions', apiSubscriptionsRouter);

const developerIds: string[] = [];

async function developerWithKey(plan: {
  tier: ApiTier;
  status?: ApiSubscriptionStatus;
  includedRequests?: number;
}): Promise<{ id: string; apiKey: string; accessToken: string }> {
  const developer = await prisma.developer.create({
    data: {
      email: `${randomUUID()}@paid-plan.test`,
      passwordHash: 'not-used',
      emailVerified: new Date(),
      isVerified: true,
      apiSubscription: {
        create: {
          tier: plan.tier,
          status: plan.status ?? 'ACTIVE',
          includedRequests: plan.includedRequests ?? (plan.tier === 'API_FREE' ? 0 : 10000),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      },
    },
  });
  developerIds.push(developer.id);
  const { key } = await generateApiKey(developer.id, 'test key', { rateLimit: 1000 });
  const { accessToken } = generateTokenPair({
    userId: developer.id,
    email: developer.email,
    tokenVersion: developer.tokenVersion,
    isDeveloper: true,
  });
  return { id: developer.id, apiKey: key, accessToken };
}

function enhance(apiKey: string, body: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/public/enhance')
    .set('X-API-Key', apiKey)
    .send({ prompt: 'Write a haiku about rain', ...body });
}

afterEach(() => vi.clearAllMocks());

afterAll(async () => {
  for (const id of developerIds) await cache.del(`api-subscription:${id}`);
  await prisma.developer.deleteMany({ where: { id: { in: developerIds } } });
});

describe('developer API paid-plan requirement', () => {
  it('returns 402 API_PLAN_REQUIRED to a free key and never calls the model', async () => {
    const free = await developerWithKey({ tier: 'API_FREE' });

    const response = await enhance(free.apiKey);

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      error: 'A paid API plan is required',
      code: 'API_PLAN_REQUIRED',
      upgradeUrl: '/developers/billing',
    });
    expect(llm.enhancePrompt).not.toHaveBeenCalled();
  });

  it('returns 402 before opening a stream for a free key', async () => {
    const free = await developerWithKey({ tier: 'API_FREE' });

    const response = await enhance(free.apiKey, { stream: true });

    expect(response.status).toBe(402);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.code).toBe('API_PLAN_REQUIRED');
    expect(llm.enhancePromptStream).not.toHaveBeenCalled();
  });

  it('blocks a legacy free row that still stores the old 100-request allowance', async () => {
    const legacy = await developerWithKey({ tier: 'API_FREE', includedRequests: 100 });

    const response = await enhance(legacy.apiKey);

    expect(response.status).toBe(402);
    expect(llm.enhancePrompt).not.toHaveBeenCalled();
  });

  it('returns 402 to a paid plan that is past due', async () => {
    const pastDue = await developerWithKey({ tier: 'API_PRO', status: 'PAST_DUE' });

    const response = await enhance(pastDue.apiKey);

    expect(response.status).toBe(402);
    expect(response.body.code).toBe('API_PLAN_REQUIRED');
    expect(llm.enhancePrompt).not.toHaveBeenCalled();
  });

  it('enhances for an active paid plan', async () => {
    llm.enhancePrompt.mockResolvedValue({
      enhancedPrompt: 'A precise haiku brief',
      inputTokens: 12,
      outputTokens: 30,
      totalTokens: 42,
      processingMs: 5,
    });
    const pro = await developerWithKey({ tier: 'API_PRO' });

    const response = await enhance(pro.apiKey);

    expect(response.status).toBe(200);
    expect(response.body.enhancedPrompt).toBe('A precise haiku brief');
    expect(llm.enhancePrompt).toHaveBeenCalledTimes(1);
  });
});

describe('developer API endpoints that never reach a model', () => {
  it('serves models to a free key', async () => {
    const free = await developerWithKey({ tier: 'API_FREE' });

    const response = await request(app).get('/api/v1/public/models').set('X-API-Key', free.apiKey);

    expect(response.status).toBe(200);
    expect(response.body.modalities.length).toBeGreaterThan(0);
  });

  it('reports zero quota and the upgrade path to a free key, even for a legacy row', async () => {
    const legacy = await developerWithKey({ tier: 'API_FREE', includedRequests: 100 });

    const first = await request(app).get('/api/v1/public/usage').set('X-API-Key', legacy.apiKey);
    const cached = await request(app).get('/api/v1/public/usage').set('X-API-Key', legacy.apiKey);

    for (const response of [first, cached]) {
      expect(response.status).toBe(200);
      expect(response.body.quota).toMatchObject({ limit: 0, remaining: 0 });
      expect(response.body.plan).toEqual({
        canEnhance: false,
        upgradeRequired: true,
        upgradeUrl: '/developers/billing',
      });
    }
  });

  it('shows a free account zero quota and the upgrade link on the billing status', async () => {
    const free = await developerWithKey({ tier: 'API_FREE' });

    const response = await request(app)
      .get('/api/v1/api-subscriptions/status')
      .set('Authorization', `Bearer ${free.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      quota: { limit: 0, remaining: 0 },
      canMakeRequests: false,
      hasActivePaidPlan: false,
      upgradeUrl: '/developers/billing',
    });
  });

  it('refuses to sell a credit pack to a free account', async () => {
    const free = await developerWithKey({ tier: 'API_FREE' });

    const response = await request(app)
      .post('/api/v1/api-subscriptions/credits/checkout')
      .set('Authorization', `Bearer ${free.accessToken}`)
      .send({
        packId: 'BOOST_5K',
        successUrl: 'https://promptomize.app/developers/billing?checkout=credits-success',
        cancelUrl: 'https://promptomize.app/developers/billing?checkout=canceled',
      });

    expect(response.status).toBe(402);
    expect(response.body.code).toBe('API_PLAN_REQUIRED');
  });
});
