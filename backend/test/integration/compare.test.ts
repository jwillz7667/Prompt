import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  buildTestApp,
  createTestUser,
  cleanupUser,
  prisma,
  type TestUser,
} from './helpers.js';

const app = buildTestApp();

// Provider fan-out itself needs live API keys; these tests pin down the
// gating, validation, and unconfigured-provider behavior that must hold
// regardless of which providers are configured.
describe('multi-provider compare gating', () => {
  let freeUser: TestUser;
  let proUser: TestUser;

  beforeAll(async () => {
    freeUser = await createTestUser();
    proUser = await createTestUser({ subscriptionTier: 'PRO' });
    await prisma.subscription.create({
      data: { userId: proUser.id, tier: 'PRO', status: 'ACTIVE' },
    });
  });

  afterAll(async () => {
    await cleanupUser(freeUser.id);
    await cleanupUser(proUser.id);
  });

  it('requires auth', async () => {
    const res = await request(app)
      .post('/api/v1/prompts/compare')
      .send({ prompt: 'x', providers: ['deepseek', 'anthropic'] });
    expect(res.status).toBe(401);
  });

  it('rejects FREE tier with an upgrade code', async () => {
    const res = await request(app)
      .post('/api/v1/prompts/compare')
      .set('Authorization', `Bearer ${freeUser.accessToken}`)
      .send({ prompt: 'improve this', providers: ['deepseek', 'anthropic'] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('COMPARE_REQUIRES_SUBSCRIPTION');
  });

  it('rejects fewer than two providers', async () => {
    const res = await request(app)
      .post('/api/v1/prompts/compare')
      .set('Authorization', `Bearer ${proUser.accessToken}`)
      .send({ prompt: 'improve this', providers: ['deepseek'] });

    expect(res.status).toBe(400);
  });

  it('returns 422 with the available list when a provider is unconfigured', async () => {
    const res = await request(app)
      .post('/api/v1/prompts/compare')
      .set('Authorization', `Bearer ${proUser.accessToken}`)
      .send({ prompt: 'improve this', providers: ['anthropic', 'gemini'] });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('anthropic');
    expect(Array.isArray(res.body.availableProviders)).toBe(true);
    expect(res.body.availableProviders).not.toContain('anthropic');
    expect(res.body.availableProviders).not.toContain('gemini');
  });

  it('lists configured providers for authenticated users', async () => {
    const res = await request(app)
      .get('/api/v1/prompts/compare/providers')
      .set('Authorization', `Bearer ${proUser.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
  });
});
