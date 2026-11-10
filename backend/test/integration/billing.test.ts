import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { retrieveSubscription } = vi.hoisted(() => {
  process.env['STRIPE_API_SECRET_KEY'] = 'sk_test_local_billing';
  process.env['STRIPE_API_WEBHOOK_SECRET'] = 'whsec_local_billing';
  process.env['STRIPE_API_STARTER_PRICE_ID'] = 'price_starter';
  process.env['STRIPE_API_PRO_PRICE_ID'] = 'price_pro';
  process.env['BACKEND_WEBHOOK_SECRET'] = 'local-consumer-webhook';
  return { retrieveSubscription: vi.fn() };
});
vi.mock('stripe', async (importOriginal) => {
  const original = await importOriginal<typeof import('stripe')>();
  return {
    ...original,
    default: class extends original.default {
      constructor(...args: ConstructorParameters<typeof original.default>) {
        super(...args);
        this.subscriptions.retrieve = retrieveSubscription;
      }
    },
  };
});

import { prisma } from '../../src/utils/prisma.js';
import { apiStripeWebhookRouter } from '../../src/routes/apiStripeWebhook.js';
import { webhookRouter } from '../../src/routes/webhooks.js';
import {
  processVerifiedTransaction,
  type VerifiedTransaction,
} from '../../src/services/appleStoreService.js';
import { getSubscriptionInfo, startFreeTrial } from '../../src/services/subscriptionService.js';
import { updateApiSubscription } from '../../src/services/apiSubscriptionService.js';

const users: string[] = [];
const developers: string[] = [];
const eventIds: string[] = [];
const app = express();
app.use(
  express.json({
    verify: (req, _res, body) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = body;
    },
  }),
);
app.use('/api-stripe', apiStripeWebhookRouter);
app.use('/webhooks', webhookRouter);
const stripe = new Stripe('sk_test_local');

async function user() {
  const value = await prisma.user.create({ data: { email: `${randomUUID()}@billing.test` } });
  users.push(value.id);
  return value;
}
async function developer() {
  const value = await prisma.developer.create({
    data: { email: `${randomUUID()}@billing.test`, passwordHash: 'not-used' },
  });
  developers.push(value.id);
  return value;
}
function transaction(overrides: Partial<VerifiedTransaction> = {}): VerifiedTransaction {
  const originalTransactionId = randomUUID();
  return {
    transactionId: randomUUID(),
    originalTransactionId,
    productId: 'com.promptomizer.pro.monthly',
    purchaseDate: new Date(),
    expirationDate: new Date(Date.now() + 86400000),
    isUpgraded: false,
    revocationDate: null,
    type: 'Auto-Renewable Subscription',
    environment: 'Sandbox',
    ...overrides,
  };
}
async function stripeEvent(type: string, object: unknown, id = `evt_${randomUUID()}`) {
  eventIds.push(id);
  const payload = JSON.stringify({ id, type, data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: 'whsec_local_billing',
  });
  return request(app)
    .post('/api-stripe')
    .set('stripe-signature', signature)
    .set('Content-Type', 'application/json')
    .send(payload);
}
function apiSubscription(developerId: string, overrides = {}) {
  const start = Math.floor(Date.now() / 1000);
  return {
    id: `sub_${developerId}`,
    customer: `cus_${developerId}`,
    status: 'active',
    cancel_at_period_end: false,
    metadata: { developerId, type: 'api_subscription', tier: 'API_PRO' },
    items: {
      data: [
        {
          price: { id: 'price_starter' },
          current_period_start: start,
          current_period_end: start + 2592000,
        },
      ],
    },
    ...overrides,
  };
}
beforeEach(() => {
  retrieveSubscription.mockReset();
});
afterEach(async () => {
  await prisma.appStoreTransaction.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
  await prisma.developer.deleteMany({ where: { id: { in: developers.splice(0) } } });
  await prisma.webhookIdempotencyKey.deleteMany({
    where: {
      OR: [
        { idempotencyKey: { in: eventIds.splice(0).map((id) => `api-stripe:${id}`) } },
        {
          endpoint: {
            in: [
              '/api/v1/webhooks/stripe/state',
              '/api/v1/webhooks/stripe',
              '/api/v1/webhooks/api-stripe/credits',
              '/api/v1/webhooks/api-stripe/period',
            ],
          },
        },
      ],
    },
  });
});

describe('App Store entitlement integrity', () => {
  it('allows only one account to claim a purchase even when claims race', async () => {
    const a = await user();
    const b = await user();
    const purchase = transaction();
    const results = await Promise.allSettled([
      processVerifiedTransaction(a.id, purchase),
      processVerifiedTransaction(b.id, purchase),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('TRANSACTION_OWNED_BY_ANOTHER_USER');
    expect(
      await prisma.subscription.count({ where: { userId: { in: [a.id, b.id] }, tier: 'PRO' } }),
    ).toBe(1);
  });
  it('rejects non-subscription, unknown, and undated products', async () => {
    const a = await user();
    for (const invalid of [
      { productId: 'unknown' },
      { expirationDate: null },
      { type: 'Consumable' },
    ]) {
      await expect(processVerifiedTransaction(a.id, transaction(invalid))).rejects.toMatchObject({
        code: 'TRANSACTION_INVALID',
      });
    }
  });
  it('does not let an old restore downgrade a newer purchase', async () => {
    const a = await user();
    const newer = transaction({ productId: 'com.promptomizer.premium.monthly' });
    await processVerifiedTransaction(a.id, newer);
    await processVerifiedTransaction(
      a.id,
      transaction({
        originalTransactionId: newer.originalTransactionId,
        purchaseDate: new Date(Date.now() - 100000),
        expirationDate: new Date(Date.now() - 1000),
      }),
    );
    expect((await getSubscriptionInfo(a.id)).tier).toBe('PREMIUM');
  });
  it('does not restore a refunded purchase by replaying its old signed transaction', async () => {
    const a = await user();
    const purchase = transaction();
    await processVerifiedTransaction(a.id, purchase);
    await processVerifiedTransaction(a.id, { ...purchase, revocationDate: new Date() });
    await processVerifiedTransaction(a.id, purchase);
    expect((await getSubscriptionInfo(a.id)).tier).toBe('FREE');
    expect(
      (
        await prisma.appStoreTransaction.findUniqueOrThrow({
          where: { transactionId: purchase.transactionId },
        })
      ).revocationDate,
    ).not.toBeNull();
  });
  it('does not grant an upgraded transaction entitlement', async () => {
    const a = await user();
    await processVerifiedTransaction(a.id, transaction({ isUpgraded: true }));
    expect((await getSubscriptionInfo(a.id)).tier).toBe('FREE');
  });
  it('preserves paid access through the verified grace-period expiry', async () => {
    const a = await user();
    await prisma.subscription.create({
      data: {
        userId: a.id,
        tier: 'PRO',
        status: 'GRACE_PERIOD',
        expiresAt: new Date(Date.now() - 1000),
        gracePeriodEndDate: new Date(Date.now() + 86400000),
      },
    });
    expect((await getSubscriptionInfo(a.id)).tier).toBe('PRO');
  });
  it('starts a missing subscription trial exactly once', async () => {
    const a = await user();
    const results = await Promise.all([startFreeTrial(a.id), startFreeTrial(a.id)]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await getSubscriptionInfo(a.id)).isTrialing).toBe(true);
  });
});

describe('API billing webhooks', () => {
  it('activates checkout developerId metadata using the actual price and item period', async () => {
    const d = await developer();
    const subscription = apiSubscription(d.id);
    retrieveSubscription.mockResolvedValue(subscription);
    expect((await stripeEvent('customer.subscription.created', subscription)).status).toBe(200);
    const result = await prisma.apiSubscription.findUniqueOrThrow({ where: { developerId: d.id } });
    expect(result.tier).toBe('API_STARTER');
    expect(result.currentPeriodEnd.getTime()).toBe(
      subscription.items.data[0]!.current_period_end * 1000,
    );
  });
  it('returns a retryable failure when canonical subscription retrieval fails', async () => {
    retrieveSubscription.mockRejectedValue(new Error('temporary network outage'));
    expect((await stripeEvent('customer.subscription.updated', { id: 'sub_outage' })).status).toBe(
      500,
    );
  });
  it('resets invoice parent subscription usage once and preserves carried credits', async () => {
    const d = await developer();
    const subscription = apiSubscription(d.id);
    retrieveSubscription.mockResolvedValue(subscription);
    await prisma.apiSubscription.create({
      data: {
        developerId: d.id,
        tier: 'API_STARTER',
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        includedRequests: 6000,
        currentPeriodUsage: 1500,
        currentPeriodStart: new Date(Date.now() - 86400000),
        currentPeriodEnd: new Date(Date.now() + 86400000),
      },
    });
    const invoice = {
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: subscription.id },
      },
      billing_reason: 'subscription_cycle',
    };
    expect((await stripeEvent('invoice.paid', invoice)).status).toBe(200);
    await prisma.apiSubscription.update({
      where: { developerId: d.id },
      data: { currentPeriodUsage: 10 },
    });
    expect((await stripeEvent('invoice.paid', invoice)).status).toBe(200);
    const result = await prisma.apiSubscription.findUniqueOrThrow({ where: { developerId: d.id } });
    expect(result.currentPeriodUsage).toBe(10);
    expect(result.includedRequests).toBe(5500);
  });
  it('does not deduct consumed prepaid credits again on a subscription update', async () => {
    const d = await developer();
    await prisma.apiSubscription.create({
      data: {
        developerId: d.id,
        tier: 'API_STARTER',
        includedRequests: 6000,
        currentPeriodUsage: 1500,
        currentPeriodEnd: new Date(Date.now() + 86400000),
      },
    });
    await updateApiSubscription(d.id, { tier: 'API_STARTER', status: 'ACTIVE' });
    expect(
      (await prisma.apiSubscription.findUniqueOrThrow({ where: { developerId: d.id } }))
        .includedRequests,
    ).toBe(6000);
  });
  it('fulfills concurrent checkout completion events only once', async () => {
    const d = await developer();
    const session = {
      id: `cs_${randomUUID()}`,
      customer: `cus_${d.id}`,
      mode: 'payment',
      payment_status: 'paid',
      amount_total: 1900,
      currency: 'usd',
      metadata: {
        developerId: d.id,
        type: 'api_credit_purchase',
        creditPackId: 'BOOST_5K',
        credits: '5000',
      },
    };
    const results = await Promise.all([
      stripeEvent('checkout.session.completed', session),
      stripeEvent('checkout.session.async_payment_succeeded', session),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(
      (await prisma.apiSubscription.findUniqueOrThrow({ where: { developerId: d.id } }))
        .includedRequests,
    ).toBe(5100);
  });
  it('rejects invalid Stripe signatures before processing', async () => {
    expect(
      (await request(app).post('/api-stripe').set('stripe-signature', 'invalid').send({})).status,
    ).toBe(400);
  });
});

describe('consumer Stripe relay', () => {
  async function relay(data: Record<string, unknown>, event = 'subscription.updated') {
    return request(app)
      .post('/webhooks/stripe')
      .set('x-webhook-secret', 'local-consumer-webhook')
      .send({ event, data });
  }
  it('does not grant a paid tier for an incomplete payment or stale event', async () => {
    const a = await user();
    const data = {
      userId: a.id,
      stripeCustomerId: `cus_${a.id}`,
      stripeSubscriptionId: `sub_${a.id}`,
      stripePriceId: 'price_pro',
      tier: 'PRO',
      status: 'incomplete',
      currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
      cancelAtPeriodEnd: false,
      stripeEventId: `evt_${randomUUID()}`,
      eventCreated: 100,
    };
    expect((await relay(data)).status).toBe(200);
    expect((await getSubscriptionInfo(a.id)).tier).toBe('FREE');
    expect(
      (
        await relay({
          ...data,
          status: 'active',
          eventCreated: 200,
          stripeEventId: `evt_${randomUUID()}`,
        })
      ).status,
    ).toBe(200);
    expect(
      (await relay({ ...data, eventCreated: 150, stripeEventId: `evt_${randomUUID()}` })).status,
    ).toBe(200);
    expect((await getSubscriptionInfo(a.id)).tier).toBe('PRO');
  });
  it('allows a Stripe subscription after the previous Apple subscription expired', async () => {
    const a = await user();
    await processVerifiedTransaction(
      a.id,
      transaction({ expirationDate: new Date(Date.now() - 1000) }),
    );
    expect(
      (
        await relay({
          userId: a.id,
          stripeCustomerId: `cus_${a.id}`,
          stripeSubscriptionId: `sub_${a.id}`,
          stripePriceId: 'price_pro',
          tier: 'PRO',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
          cancelAtPeriodEnd: false,
        })
      ).status,
    ).toBe(200);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { userId: a.id } });
    expect(subscription.tier).toBe('PRO');
    expect(subscription.originalTransactionId).toBeNull();
  });
  it('ignores cancellation for an old subscription agreement', async () => {
    const a = await user();
    await prisma.subscription.create({
      data: { userId: a.id, tier: 'PRO', stripeSubscriptionId: 'sub_new' },
    });
    expect(
      (
        await relay(
          { userId: a.id, stripeCustomerId: `cus_${a.id}`, stripeSubscriptionId: 'sub_old' },
          'subscription.deleted',
        )
      ).status,
    ).toBe(200);
    expect((await getSubscriptionInfo(a.id)).tier).toBe('PRO');
  });
});
