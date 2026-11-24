import { connect } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { chatWithSupport } = vi.hoisted(() => {
  process.env['REDIS_URL'] = process.env['TEST_REDIS_URL'] || 'redis://localhost:6379';
  return { chatWithSupport: vi.fn() };
});
vi.mock('../../src/services/supportService.js', () => ({
  chatWithSupport,
  getTicket: vi.fn(),
  getUserTickets: vi.fn(),
  continueTicketChat: vi.fn(),
}));

import { authenticate } from '../../src/middleware/auth.js';
import { requireEntitlement } from '../../src/middleware/requireEntitlement.js';
import { supportRouter } from '../../src/routes/support.js';
import {
  dailyCounterKey,
  getDailyCounter,
  recordUsage,
} from '../../src/services/subscriptionService.js';
import { cache, closeRedis, initRedis } from '../../src/utils/redis.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

// CI provisions only Postgres; the DB-fallback fair-use path is covered in
// hard-paywall.test.ts, so this file runs wherever a Redis is reachable.
async function isRedisReachable(url: string): Promise<boolean> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port || 6379), timeout: 500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
const hasRedis = await isRedisReachable(process.env['REDIS_URL'] ?? '');

const app = express();
app.use(express.json());
app.post('/gated', authenticate, requireEntitlement, (_req, res) => {
  res.json({ ok: true });
});
app.use('/support', supportRouter);

let subscriber: TestUser;

beforeAll(async () => {
  if (!hasRedis) return;
  await initRedis();
  subscriber = await createTestUser();
  await prisma.subscription.create({
    data: {
      userId: subscriber.id,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
});

beforeEach(async () => {
  chatWithSupport.mockReset();
  if (!hasRedis) return;
  await Promise.all([
    cache.del(dailyCounterKey('gen', subscriber.id)),
    cache.del(dailyCounterKey('support', subscriber.id)),
  ]);
});

afterAll(async () => {
  if (!hasRedis) return;
  await Promise.all([
    cache.del(dailyCounterKey('gen', subscriber.id)),
    cache.del(dailyCounterKey('support', subscriber.id)),
    cache.invalidateSubscription(subscriber.id),
    cache.invalidateUser(subscriber.id),
  ]);
  await prisma.dailyUsage.deleteMany({ where: { userId: subscriber.id } });
  await cleanupUser(subscriber.id);
  await closeRedis();
});

async function setCounter(scope: 'gen' | 'support', value: number): Promise<void> {
  await cache.set(dailyCounterKey(scope, subscriber.id), value, 60);
}

describe.skipIf(!hasRedis)('fair use with the Redis counter', () => {
  it('counts each successful generation atomically in Redis', async () => {
    await recordUsage(subscriber.id);
    await recordUsage(subscriber.id);

    expect(await getDailyCounter('gen', subscriber.id)).toBe(2);
  });

  it('allows a subscriber below the daily ceiling', async () => {
    await setCounter('gen', 299);

    const response = await request(app)
      .post('/gated')
      .set('Authorization', `Bearer ${subscriber.accessToken}`);

    expect(response.status).toBe(200);
  });

  it('returns 429 FAIR_USE_LIMIT at the daily ceiling', async () => {
    await setCounter('gen', 300);

    const response = await request(app)
      .post('/gated')
      .set('Authorization', `Bearer ${subscriber.accessToken}`);

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      error: 'Daily fair-use limit reached',
      code: 'FAIR_USE_LIMIT',
    });
  });
});

describe.skipIf(!hasRedis)('support assistant cap', () => {
  it('answers and counts a support reply under the cap', async () => {
    chatWithSupport.mockResolvedValue({ reply: 'Happy to help', ticketCreated: false });

    const response = await request(app)
      .post('/support/chat')
      .set('Authorization', `Bearer ${subscriber.accessToken}`)
      .send({ message: 'How do I restore purchases?' });

    expect(response.status).toBe(200);
    expect(await getDailyCounter('support', subscriber.id)).toBe(1);
  });

  it('returns 429 SUPPORT_LIMIT_REACHED without calling the assistant at the cap', async () => {
    await setCounter('support', 20);

    const response = await request(app)
      .post('/support/chat')
      .set('Authorization', `Bearer ${subscriber.accessToken}`)
      .send({ message: 'Hello again' });

    expect(response.status).toBe(429);
    expect(response.body.code).toBe('SUPPORT_LIMIT_REACHED');
    expect(chatWithSupport).not.toHaveBeenCalled();
  });

  it('does not count a failed support reply or leak its error', async () => {
    chatWithSupport.mockRejectedValue(new Error('upstream 402 insufficient balance'));

    const response = await request(app)
      .post('/support/chat')
      .set('Authorization', `Bearer ${subscriber.accessToken}`)
      .send({ message: 'Hi' });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('insufficient');
    expect(await getDailyCounter('support', subscriber.id)).toBe(0);
  });
});
