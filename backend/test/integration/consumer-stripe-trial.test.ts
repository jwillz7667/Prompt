import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['BACKEND_WEBHOOK_SECRET'] = 'local-consumer-webhook';
});

import { webhookRouter } from '../../src/routes/webhooks.js';
import { subscriptionRouter } from '../../src/routes/subscriptions.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

const app = express();
app.use(express.json());
app.use('/webhooks', webhookRouter);
app.use('/subscriptions', subscriptionRouter);

const users: TestUser[] = [];
async function user(): Promise<TestUser> {
  const created = await createTestUser();
  users.push(created);
  return created;
}

afterEach(async () => {
  for (const created of users.splice(0)) await cleanupUser(created.id);
  await prisma.webhookIdempotencyKey.deleteMany({
    where: { endpoint: { in: ['/api/v1/webhooks/stripe/state', '/api/v1/webhooks/stripe'] } },
  });
});

function relay(account: TestUser, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/webhooks/stripe')
    .set('x-webhook-secret', 'local-consumer-webhook')
    .send({
      event: 'subscription.updated',
      data: {
        userId: account.id,
        stripeCustomerId: `cus_${account.id}`,
        stripeSubscriptionId: `sub_${account.id}`,
        stripePriceId: 'price_premium_monthly',
        tier: 'PREMIUM',
        status: 'trialing',
        currentPeriodEnd: new Date(Date.now() + 3 * 86400000).toISOString(),
        cancelAtPeriodEnd: false,
        stripeEventId: `evt_${randomUUID()}`,
        eventCreated: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    });
}

function status(account: TestUser) {
  return request(app)
    .get('/subscriptions/status')
    .set('Authorization', `Bearer ${account.accessToken}`);
}

describe('consumer Stripe trial tracking', () => {
  it('marks the trial used when a trialing subscription is relayed', async () => {
    const account = await user();

    const response = await relay(account);

    expect(response.status).toBe(200);
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { userId: account.id },
    });
    expect(subscription).toMatchObject({ tier: 'PREMIUM', isTrialing: true, hasUsedTrial: true });
  });

  it('keeps the trial marked used after the subscription is canceled', async () => {
    const account = await user();
    await relay(account);

    await request(app)
      .post('/webhooks/stripe')
      .set('x-webhook-secret', 'local-consumer-webhook')
      .send({
        event: 'subscription.deleted',
        data: {
          userId: account.id,
          stripeCustomerId: `cus_${account.id}`,
          stripeSubscriptionId: `sub_${account.id}`,
        },
      });

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { userId: account.id },
    });
    expect(subscription).toMatchObject({ tier: 'FREE', hasUsedTrial: true });
  });

  it('marks the trial used when the first relay arrives after the trial ended', async () => {
    const account = await user();

    await relay(account, { status: 'active', hadTrial: true });

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { userId: account.id },
    });
    expect(subscription.hasUsedTrial).toBe(true);
  });

  it('does not mark a trial for a paid subscription that never trialed', async () => {
    const account = await user();

    await relay(account, { status: 'active', hadTrial: false });

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { userId: account.id },
    });
    expect(subscription.hasUsedTrial).toBe(false);
  });
});

describe('web trial eligibility on GET /subscriptions/status', () => {
  it('offers the trial to an account that never subscribed', async () => {
    const account = await user();

    const response = await status(account);

    expect(response.status).toBe(200);
    expect(response.body.trialEligible).toBe(true);
  });

  it('withholds the trial once a Stripe trial was used', async () => {
    const account = await user();
    await relay(account);

    const response = await status(account);

    expect(response.body).toMatchObject({ trialEligible: false, isEntitled: true });
  });

  it('withholds the trial from an account with any App Store purchase', async () => {
    const account = await user();
    await prisma.appStoreTransaction.create({
      data: {
        userId: account.id,
        transactionId: `tx_${randomUUID()}`,
        originalTransactionId: `otx_${randomUUID()}`,
        productId: 'com.promptomizer.premium.monthly',
        type: 'Auto-Renewable Subscription',
        purchaseDate: new Date(Date.now() - 40 * 86400000),
        expirationDate: new Date(Date.now() - 10 * 86400000),
        environment: 'Production',
      },
    });

    const response = await status(account);

    expect(response.body.trialEligible).toBe(false);
  });
});
