import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '../../src/utils/prisma.js';
import { generateTokenPair } from '../../src/utils/jwt.js';
import { apiSubscriptionsRouter } from '../../src/routes/apiSubscriptions.js';
import { docsRouter } from '../../src/routes/docs.js';

const app = express()
  .use(express.json())
  .use('/api/v1/api-subscriptions', apiSubscriptionsRouter)
  .use('/api/v1/docs', docsRouter);

const developerIds: string[] = [];

async function developerToken(): Promise<string> {
  const developer = await prisma.developer.create({
    data: { email: `${randomUUID()}@api-docs.test`, passwordHash: 'not-used' },
  });
  developerIds.push(developer.id);
  return generateTokenPair({
    userId: developer.id,
    email: developer.email,
    tokenVersion: developer.tokenVersion,
    isDeveloper: true,
  }).accessToken;
}

afterAll(async () => {
  await prisma.developer.deleteMany({ where: { id: { in: developerIds } } });
});

describe('developer API documentation', () => {
  it('lists only paid plans and no free enhancement allowance', async () => {
    const plans = await request(app)
      .get('/api/v1/api-subscriptions/plans')
      .set('Authorization', `Bearer ${await developerToken()}`);
    const overview = await request(app).get('/api/v1/docs/');

    const offered = [...plans.body.plans, ...overview.body.rateLimits.tiers] as Array<{
      id?: string;
      tier?: string;
      monthlyRequests: number | 'unlimited';
    }>;
    expect(offered.map((plan) => plan.id ?? plan.tier)).not.toContain('API_FREE');
    expect(
      offered.every((plan) => plan.monthlyRequests === 'unlimited' || plan.monthlyRequests > 0),
    ).toBe(true);
  });

  it('documents 402 API_PLAN_REQUIRED on enhance in both specifications', async () => {
    const openApi = await request(app).get('/api/v1/docs/openapi.json');
    const actions = await request(app).get('/api/v1/docs/gpt-actions.json');

    for (const spec of [openApi.body, actions.body]) {
      expect(spec.paths['/public/enhance'].post.responses['402']).toBeDefined();
      expect(spec.components.schemas.PlanRequiredError.properties.code.enum).toEqual([
        'API_PLAN_REQUIRED',
      ]);
    }
  });
});
