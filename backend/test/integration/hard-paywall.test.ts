import { randomUUID } from 'node:crypto';
import express, { type Express, type Router } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { promptRouter } from '../../src/routes/prompts.js';
import { threadRouter } from '../../src/routes/threads.js';
import variationsRouter from '../../src/routes/variations.js';
import workflowsRouter from '../../src/routes/workflows.js';
import sandboxRouter from '../../src/routes/sandbox.js';
import { optimizeRouter } from '../../src/routes/optimize.js';
import contextsRouter from '../../src/routes/contexts.js';
import { supportRouter } from '../../src/routes/support.js';
import { subscriptionRouter } from '../../src/routes/subscriptions.js';
import { userRouter } from '../../src/routes/users.js';
import { authRouter } from '../../src/routes/auth.js';
import { requireEntitlement } from '../../src/middleware/requireEntitlement.js';
import {
  processVerifiedTransaction,
  type VerifiedTransaction,
} from '../../src/services/appleStoreService.js';
import { getSubscriptionInfo } from '../../src/services/subscriptionService.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

type Gate = 'entitled' | 'open';

interface Mount {
  prefix: string;
  router: Router;
  // Every route the router declares, keyed "METHOD /path". A new route that is
  // missing here fails the inventory test, forcing an explicit gating decision.
  routes: Record<string, Gate>;
}

// Routes that can reach an LLM, embedding, or vision provider are 'entitled'.
// Reads, deletes, saves, account and support stay 'open' so lapsed users can
// still see and delete their data and reach support.
const MOUNTS: Mount[] = [
  {
    prefix: '/api/v1/prompts',
    router: promptRouter,
    routes: {
      'POST /guest/enhance/stream': 'open',
      'POST /enhance': 'entitled',
      'POST /enhance/stream': 'entitled',
      'POST /': 'open',
      'GET /': 'open',
      'GET /:id': 'open',
      'PATCH /:id': 'open',
      'DELETE /:id': 'open',
      'POST /bulk/favorite': 'open',
      'POST /bulk/delete': 'open',
      'GET /:id/versions': 'open',
      'POST /:id/restore': 'open',
      'POST /:id/share': 'open',
      'DELETE /:id/share': 'open',
      'GET /compare/providers': 'open',
      'POST /compare': 'entitled',
    },
  },
  {
    prefix: '/api/v1/threads',
    router: threadRouter,
    routes: {
      'POST /': 'entitled',
      'POST /:id/turns/stream': 'entitled',
      'GET /': 'open',
      'GET /:id': 'open',
      'PATCH /:id': 'open',
      'DELETE /:id': 'open',
    },
  },
  {
    prefix: '/api/v1/variations',
    router: variationsRouter,
    routes: {
      'POST /generate': 'entitled',
      'GET /:id': 'open',
      'POST /:id/rate': 'open',
      'POST /:id/select': 'open',
      'GET /': 'open',
    },
  },
  {
    prefix: '/api/v1/workflows',
    router: workflowsRouter,
    routes: {
      'POST /': 'entitled',
      'PUT /:id': 'open',
      'DELETE /:id': 'open',
      'GET /:id': 'open',
      'GET /': 'open',
      'POST /:id/execute': 'entitled',
      'GET /executions/:executionId': 'open',
      'GET /:id/executions': 'open',
      'POST /:id/clone': 'open',
      'GET /:id/export': 'open',
      'POST /import': 'entitled',
    },
  },
  {
    prefix: '/api/v1/sandbox',
    router: sandboxRouter,
    routes: {
      'POST /': 'entitled',
      'POST /:id/execute': 'entitled',
      'GET /:id': 'open',
      'GET /': 'open',
      'DELETE /:id': 'open',
      'GET /:id/compare': 'open',
      'GET /platforms/available': 'open',
      'POST /batch': 'entitled',
    },
  },
  {
    prefix: '/api/v1/optimize',
    router: optimizeRouter,
    routes: {
      'POST /': 'entitled',
      'GET /:jobId/stream': 'open',
      'GET /:jobId': 'open',
    },
  },
  {
    prefix: '/api/v1/contexts',
    router: contextsRouter,
    routes: {
      'POST /': 'entitled',
      'PUT /:id': 'entitled',
      'DELETE /:id': 'open',
      'GET /:id': 'open',
      'GET /': 'open',
      'POST /search': 'entitled',
      'POST /:id/attach': 'open',
      'GET /prompt/:promptId': 'open',
      'POST /merge': 'entitled',
    },
  },
  {
    prefix: '/api/v1/support',
    router: supportRouter,
    routes: {
      'POST /chat': 'open',
      'GET /tickets': 'open',
      'GET /tickets/:ticketId': 'open',
      'POST /tickets/:ticketId/chat': 'open',
    },
  },
  {
    prefix: '/api/v1/subscriptions',
    router: subscriptionRouter,
    routes: {
      'GET /status': 'open',
      'POST /verify': 'open',
      'POST /restore': 'open',
      'GET /products': 'open',
    },
  },
  {
    prefix: '/api/v1/users',
    router: userRouter,
    routes: {
      'GET /me': 'open',
      'PATCH /profile': 'open',
      'GET /stats': 'open',
      'GET /sessions': 'open',
      'DELETE /sessions/:id': 'open',
      'DELETE /account': 'open',
      'POST /device-token': 'open',
      'DELETE /device-token': 'open',
    },
  },
  {
    prefix: '/api/v1/auth',
    router: authRouter,
    routes: {
      'POST /apple': 'open',
      'POST /google': 'open',
      'POST /refresh': 'open',
      'POST /logout': 'open',
      'POST /logout-all': 'open',
      'GET /me': 'open',
    },
  },
];

function buildApp(): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  for (const mount of MOUNTS) app.use(mount.prefix, mount.router);
  return app;
}

const handlerSchema = z.custom<(...args: never[]) => unknown>(
  (value) => typeof value === 'function',
);
const layerSchema = z.object({
  handle: handlerSchema,
  route: z
    .object({
      path: z.string(),
      methods: z.record(z.string(), z.boolean()),
      stack: z.array(z.object({ handle: handlerSchema })),
    })
    .optional(),
});
const stackSchema = z.array(layerSchema);

// Express routers are functions carrying a `stack`; read it without a cast.
function layersOf(routerOrApp: unknown): z.infer<typeof stackSchema> {
  return stackSchema.parse(Reflect.get(Object(routerOrApp), 'stack'));
}

function declaredRoutes(router: Router): Record<string, Gate> {
  const routes: Record<string, Gate> = {};
  for (const layer of layersOf(router)) {
    if (!layer.route) continue;
    const isGated = layer.route.stack.some((entry) => entry.handle === requireEntitlement);
    for (const method of Object.keys(layer.route.methods)) {
      routes[`${method.toUpperCase()} ${layer.route.path}`] = isGated ? 'entitled' : 'open';
    }
  }
  return routes;
}

function toUrl(prefix: string, path: string): string {
  return `${prefix}${path === '/' ? '' : path}`.replace(/:[A-Za-z]+/g, 'c00000000000000000000000');
}

function send(app: Express, method: string, url: string) {
  const agent = request(app);
  switch (method) {
    case 'GET':
      return agent.get(url);
    case 'PUT':
      return agent.put(url);
    case 'PATCH':
      return agent.patch(url);
    case 'DELETE':
      return agent.delete(url);
    default:
      return agent.post(url);
  }
}

const gatedRoutes = MOUNTS.flatMap((mount) =>
  Object.entries(mount.routes)
    .filter(([, gate]) => gate === 'entitled')
    .map(([route]) => {
      const [method = 'POST', path = '/'] = route.split(' ');
      return { label: `${method} ${mount.prefix}${path === '/' ? '' : path}`, method, path, mount };
    }),
);

const app = buildApp();
const DAY_MS = 86_400_000;
const users: TestUser[] = [];

async function userWithSubscription(
  data: Partial<{
    tier: 'FREE' | 'PREMIUM' | 'PRO';
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELED' | 'GRACE_PERIOD';
    expiresAt: Date | null;
    gracePeriodEndDate: Date | null;
    environment: string | null;
  }>,
): Promise<TestUser> {
  const user = await createTestUser();
  users.push(user);
  await prisma.subscription.create({ data: { userId: user.id, ...data } });
  return user;
}

function transaction(overrides: Partial<VerifiedTransaction> = {}): VerifiedTransaction {
  return {
    transactionId: randomUUID(),
    originalTransactionId: randomUUID(),
    productId: 'com.promptomizer.premium.monthly',
    purchaseDate: new Date(),
    expirationDate: new Date(Date.now() + 30 * DAY_MS),
    isUpgraded: false,
    revocationDate: null,
    type: 'Auto-Renewable Subscription',
    environment: 'Production',
    ...overrides,
  };
}

// A body every gated handler rejects with 400 once past the gate, so passing
// the gate is observable without ever calling a provider.
async function postInvalidEnhance(user: TestUser) {
  return request(app)
    .post('/api/v1/prompts/enhance')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ prompt: '' });
}

let freeUser: TestUser;

beforeAll(async () => {
  process.env['REFLECTION_LOOP_ENABLED'] = 'true';
  freeUser = await createTestUser();
  users.push(freeUser);
});

afterAll(async () => {
  delete process.env['REFLECTION_LOOP_ENABLED'];
  for (const user of users.splice(0)) {
    await prisma.dailyUsage.deleteMany({ where: { userId: user.id } });
    await cleanupUser(user.id);
  }
});

describe('route inventory', () => {
  it('mounts exactly the routers covered by the inventory', () => {
    const appStack = layersOf(Reflect.get(app, '_router'));
    const mountedRouters = appStack
      .map((layer) => layer.handle)
      .filter((handle) => MOUNTS.some((mount) => mount.router === handle));

    expect(mountedRouters).toHaveLength(MOUNTS.length);
  });

  it.each(MOUNTS.map((mount) => [mount.prefix, mount] as const))(
    'gates exactly the provider-reaching routes under %s',
    (_prefix, mount) => {
      expect(declaredRoutes(mount.router)).toEqual(mount.routes);
    },
  );
});

describe('hard paywall', () => {
  it.each(gatedRoutes.map((route) => [route.label, route] as const))(
    'returns 403 SUBSCRIPTION_REQUIRED for a FREE user on %s',
    async (_label, route) => {
      const response = await send(app, route.method, toUrl(route.mount.prefix, route.path))
        .set('Authorization', `Bearer ${freeUser.accessToken}`)
        .send({});

      expect(response.status).toBe(403);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({
        error: 'Subscription required',
        code: 'QUOTA_EXCEEDED',
        reason: 'SUBSCRIPTION_REQUIRED',
        remainingQuota: 0,
      });
    },
  );

  it('lets an active PREMIUM subscriber through the gate', async () => {
    const user = await userWithSubscription({
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(400);
  });

  it('treats a grandfathered PRO subscriber as PREMIUM', async () => {
    const user = await userWithSubscription({
      tier: 'PRO',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    const [response, info] = await Promise.all([
      postInvalidEnhance(user),
      getSubscriptionInfo(user.id),
    ]);

    expect(response.status).toBe(400);
    expect(info.tier).toBe('PREMIUM');
  });

  it('lets a subscriber in the billing grace period through the gate', async () => {
    const user = await userWithSubscription({
      tier: 'PREMIUM',
      status: 'GRACE_PERIOD',
      expiresAt: new Date(Date.now() - DAY_MS),
      gracePeriodEndDate: new Date(Date.now() + DAY_MS),
    });

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(400);
  });

  it('blocks a subscriber whose subscription has expired', async () => {
    const user = await userWithSubscription({
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(403);
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })).status,
    ).toBe('EXPIRED');
  });

  it('blocks a canceled subscription even before its expiry', async () => {
    const user = await userWithSubscription({
      tier: 'PREMIUM',
      status: 'CANCELED',
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    expect((await postInvalidEnhance(user)).status).toBe(403);
  });

  it('revokes access when the App Store purchase is refunded', async () => {
    const user = await createTestUser();
    users.push(user);
    const purchase = transaction();
    await processVerifiedTransaction(user.id, purchase);
    expect((await postInvalidEnhance(user)).status).toBe(400);

    await processVerifiedTransaction(user.id, { ...purchase, revocationDate: new Date() });

    expect((await postInvalidEnhance(user)).status).toBe(403);
  });

  it('returns 429 FAIR_USE_LIMIT once a subscriber reaches the daily ceiling', async () => {
    const user = await userWithSubscription({
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + DAY_MS),
    });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.dailyUsage.create({ data: { userId: user.id, date: today, promptCount: 300 } });

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(429);
    expect(response.body.code).toBe('FAIR_USE_LIMIT');
    expect(new Date(response.body.resetAt).getTime()).toBe(today.getTime() + DAY_MS);
  });

  it('keeps read routes available to a lapsed user', async () => {
    const response = await request(app)
      .get('/api/v1/threads')
      .set('Authorization', `Bearer ${freeUser.accessToken}`);

    expect(response.status).toBe(200);
  });
});

describe('removed free-access paths', () => {
  it('returns 401 AUTH_REQUIRED from the retired guest generation endpoint', async () => {
    const response = await request(app)
      .post('/api/v1/prompts/guest/enhance/stream')
      .set('X-Guest-Session', 'anything')
      .send({ prompt: 'write a poem' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Sign in required', code: 'AUTH_REQUIRED' });
  });

  it.each([
    ['POST', '/api/v1/subscriptions/trial'],
    ['GET', '/api/v1/subscriptions/trial/eligibility'],
  ])('returns 404 for the removed server trial route %s %s', async (method, url) => {
    const response = await send(app, method, url).set(
      'Authorization',
      `Bearer ${freeUser.accessToken}`,
    );

    expect(response.status).toBe(404);
  });

  it('lists only the monthly Premium product without server trial fields', async () => {
    const response = await request(app)
      .get('/api/v1/subscriptions/products')
      .set('Authorization', `Bearer ${freeUser.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0].productId).toBe('com.promptomizer.premium.monthly');
    expect(response.body).not.toHaveProperty('trialEligible');
    expect(response.body.products[0]).not.toHaveProperty('trialEligible');
  });
});

describe('subscription status and identity', () => {
  it('reports isEntitled on GET /subscriptions/status', async () => {
    const premium = await userWithSubscription({
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    const [freeStatus, premiumStatus] = await Promise.all([
      request(app)
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${freeUser.accessToken}`),
      request(app)
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${premium.accessToken}`),
    ]);

    expect(freeStatus.body.isEntitled).toBe(false);
    expect(premiumStatus.body.isEntitled).toBe(true);
    expect(premiumStatus.body.subscription).toMatchObject({
      tier: 'PREMIUM',
      status: 'ACTIVE',
      isTrialing: false,
      isEntitled: true,
    });
  });

  it.each(['/api/v1/users/me', '/api/v1/auth/me'])(
    'returns the lowercase appAccountToken from %s',
    async (url) => {
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: freeUser.id } });

      const response = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${freeUser.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user.appAccountToken).toBe(stored.appAccountToken);
      expect(response.body.user.appAccountToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    },
  );

  it('rejects a purchase whose appAccountToken belongs to another account with 409', async () => {
    const owner = await createTestUser();
    const claimant = await createTestUser();
    users.push(owner, claimant);
    const ownerRow = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });

    await expect(
      processVerifiedTransaction(
        claimant.id,
        transaction({ appAccountToken: ownerRow.appAccountToken }),
      ),
    ).rejects.toMatchObject({ code: 'TRANSACTION_OWNED_BY_ANOTHER_USER', statusCode: 409 });
    expect(await prisma.subscription.count({ where: { userId: claimant.id } })).toBe(0);
  });

  it('marks an introductory free trial as trialing until the trial ends', async () => {
    const user = await createTestUser();
    users.push(user);
    const trial = transaction({
      offerType: 1,
      offerDiscountType: 'FREE_TRIAL',
      expirationDate: new Date(Date.now() + 3 * DAY_MS),
    });

    await processVerifiedTransaction(user.id, trial);

    const [info, row, stored] = await Promise.all([
      getSubscriptionInfo(user.id),
      prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } }),
      prisma.appStoreTransaction.findUniqueOrThrow({
        where: { transactionId: trial.transactionId },
      }),
    ]);
    expect(info).toMatchObject({ tier: 'PREMIUM', isTrialing: true, isEntitled: true });
    expect(info.trialEndsAt?.getTime()).toBe(trial.expirationDate?.getTime());
    expect(row.hasUsedTrial).toBe(true);
    expect(stored).toMatchObject({ offerType: 1, offerDiscountType: 'FREE_TRIAL' });
  });

  it('clears trialing when the first paid renewal arrives', async () => {
    const user = await createTestUser();
    users.push(user);
    const trial = transaction({
      offerType: 1,
      offerDiscountType: 'FREE_TRIAL',
      purchaseDate: new Date(Date.now() - 3 * DAY_MS),
      expirationDate: new Date(Date.now() + DAY_MS),
    });
    await processVerifiedTransaction(user.id, trial);

    await processVerifiedTransaction(
      user.id,
      transaction({
        originalTransactionId: trial.originalTransactionId,
        expirationDate: new Date(Date.now() + 31 * DAY_MS),
      }),
    );

    const info = await getSubscriptionInfo(user.id);
    expect(info).toMatchObject({ tier: 'PREMIUM', isTrialing: false });
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })).hasUsedTrial,
    ).toBe(true);
  });

  it('records the App Store environment on the subscription', async () => {
    const user = await createTestUser();
    users.push(user);

    await processVerifiedTransaction(user.id, transaction({ environment: 'Sandbox' }));

    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })).environment,
    ).toBe('Sandbox');
  });

  it('unlocks a sandbox purchase on a new account such as an App Review sign-in', async () => {
    const user = await createTestUser();
    users.push(user);

    await processVerifiedTransaction(user.id, transaction({ environment: 'Sandbox' }));

    expect((await getSubscriptionInfo(user.id)).isEntitled).toBe(true);
  });

  it('does not unlock a sandbox purchase on a long-standing account', async () => {
    const user = await createTestUser();
    users.push(user);
    await prisma.user.update({
      where: { id: user.id },
      data: { createdAt: new Date(Date.now() - 60 * DAY_MS) },
    });

    await processVerifiedTransaction(user.id, transaction({ environment: 'Sandbox' }));

    expect(await getSubscriptionInfo(user.id)).toMatchObject({ isEntitled: false, tier: 'FREE' });
  });

  it('removes App Store transactions when the owning account is deleted', async () => {
    const user = await createTestUser();
    const purchase = transaction();
    await processVerifiedTransaction(user.id, purchase);

    await cleanupUser(user.id);

    expect(
      await prisma.appStoreTransaction.count({
        where: { transactionId: purchase.transactionId },
      }),
    ).toBe(0);
  });
});
