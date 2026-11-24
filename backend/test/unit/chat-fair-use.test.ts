import { describe, expect, it, vi } from 'vitest';

import {
  chatUsageKey,
  createFairUseLimiter,
  type FairUseCounterClient,
} from '../../src/features/chat/fair-use.js';

function memoryCounter(): FairUseCounterClient & { values: Map<string, number> } {
  const values = new Map<string, number>();
  return {
    values,
    incr: (key) => {
      const next = (values.get(key) ?? 0) + 1;
      values.set(key, next);
      return Promise.resolve(next);
    },
    decr: (key) => {
      const next = (values.get(key) ?? 0) - 1;
      values.set(key, next);
      return Promise.resolve(next);
    },
    expire: () => Promise.resolve(1),
  };
}

const now = new Date('2026-11-24T15:00:00.000Z');

describe('createFairUseLimiter', () => {
  it('denies the request past the ceiling without consuming a slot', async () => {
    const client = memoryCounter();
    const limiter = createFairUseLimiter({
      dailyLimit: 2,
      resolveClient: () => client,
      countMessagesSince: vi.fn(),
      logger: { warn: vi.fn() },
    });

    await limiter.reserve('u1', now);
    await limiter.reserve('u1', now);
    const third = await limiter.reserve('u1', now);

    expect(third).toEqual({ isAllowed: false, resetAt: new Date('2026-11-25T00:00:00.000Z') });
    expect(client.values.get(chatUsageKey('u1', now))).toBe(2);
  });

  it('returns a released slot exactly once', async () => {
    const client = memoryCounter();
    const limiter = createFairUseLimiter({
      dailyLimit: 5,
      resolveClient: () => client,
      countMessagesSince: vi.fn(),
      logger: { warn: vi.fn() },
    });

    const result = await limiter.reserve('u1', now);
    if (!result.isAllowed) throw new Error('expected a reservation');
    await result.reservation.release();
    await result.reservation.release();

    expect(client.values.get(chatUsageKey('u1', now))).toBe(0);
  });

  it('counts persisted messages since UTC midnight when Redis is unavailable', async () => {
    const countMessagesSince = vi.fn().mockResolvedValue(3);
    const limiter = createFairUseLimiter({
      dailyLimit: 3,
      resolveClient: () => undefined,
      countMessagesSince,
      logger: { warn: vi.fn() },
    });

    const result = await limiter.reserve('u1', now);

    expect(result.isAllowed).toBe(false);
    expect(countMessagesSince).toHaveBeenCalledWith('u1', new Date('2026-11-24T00:00:00.000Z'));
  });

  it('uses the documented per-day key', () => {
    expect(chatUsageKey('u1', now)).toBe('usage:chat:v1:u1:2026-11-24');
  });
});
