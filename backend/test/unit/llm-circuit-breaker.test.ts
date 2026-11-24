import { describe, expect, it, vi } from 'vitest';

import {
  bypassPermit,
  createCircuitBreaker,
  createFallbackBreakerStore,
  createMemoryBreakerStore,
  type BreakerPermit,
  type BreakerStore,
  type CircuitBreaker,
} from '../../src/features/llm/circuit-breaker.js';
import type { LlmProviderName } from '../../src/features/llm/config.js';
import { ProviderError, type ProviderErrorKind } from '../../src/features/llm/errors.js';
import { silentLogger } from './llm-test-helpers.js';

const breakerConfig = {
  longCooldownMs: 300_000,
  shortCooldownMs: 30_000,
  failureThreshold: 3,
  failureWindowMs: 30_000,
};
const failure = (kind: ProviderErrorKind) =>
  new ProviderError({ kind, provider: 'deepseek', message: kind });

const closed = bypassPermit;

async function isAllowed(breaker: CircuitBreaker, provider: LlmProviderName): Promise<boolean> {
  return (await breaker.tryAcquire(provider)).isAllowed;
}

async function acquire(breaker: CircuitBreaker, provider: LlmProviderName): Promise<BreakerPermit> {
  const decision = await breaker.tryAcquire(provider);
  if (!decision.isAllowed) throw new Error(`expected ${provider} to be acquirable`);
  return decision.permit;
}

function setup() {
  let now = 1_000_000;
  const store = createMemoryBreakerStore(() => now);
  const logger = silentLogger();
  const breaker = createCircuitBreaker({ store, config: breakerConfig, logger });
  return { breaker, logger, advance: (ms: number) => { now += ms; } };
}

describe('LLM circuit breaker', () => {
  it('opens for the long cooldown on a provider-wide failure and logs once at error level', async () => {
    const { breaker, logger, advance } = setup();

    await breaker.recordFailure(closed('deepseek'), failure('insufficient_balance'));
    await breaker.recordFailure(closed('deepseek'), failure('insufficient_balance'));

    expect(await isAllowed(breaker, 'deepseek')).toBe(false);
    expect(logger.error).toHaveBeenCalledOnce();
    advance(299_000);
    expect(await isAllowed(breaker, 'deepseek')).toBe(false);
  });

  it('opens after three transient failures inside the window', async () => {
    const { breaker } = setup();

    await breaker.recordFailure(closed('openrouter'), failure('overloaded'));
    await breaker.recordFailure(closed('openrouter'), failure('timeout'));
    expect(await isAllowed(breaker, 'openrouter')).toBe(true);
    await breaker.recordFailure(closed('openrouter'), failure('rate_limited'));

    expect(await isAllowed(breaker, 'openrouter')).toBe(false);
  });

  it('forgets transient failures once the window lapses', async () => {
    const { breaker, advance } = setup();

    await breaker.recordFailure(closed('local'), failure('overloaded'));
    await breaker.recordFailure(closed('local'), failure('overloaded'));
    advance(31_000);
    await breaker.recordFailure(closed('local'), failure('overloaded'));

    expect(await isAllowed(breaker, 'local')).toBe(true);
  });

  it('allows exactly one half-open probe and closes on its success', async () => {
    const { breaker, advance } = setup();
    for (let index = 0; index < 3; index += 1) await breaker.recordFailure(closed('deepseek'), failure('timeout'));
    advance(30_001);

    const probe = await acquire(breaker, 'deepseek');
    expect(await isAllowed(breaker, 'deepseek')).toBe(false);
    await breaker.recordSuccess(probe);

    expect(await isAllowed(breaker, 'deepseek')).toBe(true);
    expect(await isAllowed(breaker, 'deepseek')).toBe(true);
  });

  it('reopens immediately when the half-open probe fails', async () => {
    const { breaker, advance } = setup();
    await breaker.recordFailure(closed('deepseek'), failure('auth'));
    advance(300_001);
    const probe = await acquire(breaker, 'deepseek');

    await breaker.recordFailure(probe, failure('overloaded'));

    expect(await isAllowed(breaker, 'deepseek')).toBe(false);
  });

  it('keeps the half-open probe when a caller that never held it is released', async () => {
    const { breaker, advance } = setup();
    const earlier = await acquire(breaker, 'deepseek');
    for (let index = 0; index < 3; index += 1) await breaker.recordFailure(closed('deepseek'), failure('timeout'));
    advance(30_001);
    await acquire(breaker, 'deepseek');

    await breaker.release(earlier);
    await breaker.recordFailure(earlier, failure('bad_request'));

    expect(await isAllowed(breaker, 'deepseek')).toBe(false);
  });

  it('frees the half-open slot when the probe holder releases it', async () => {
    const { breaker, advance } = setup();
    for (let index = 0; index < 3; index += 1) await breaker.recordFailure(closed('deepseek'), failure('timeout'));
    advance(30_001);
    const probe = await acquire(breaker, 'deepseek');

    await breaker.release(probe);

    expect(await isAllowed(breaker, 'deepseek')).toBe(true);
  });

  it('reports whether a denial is provider-wide or transient', async () => {
    const { breaker } = setup();
    await breaker.recordFailure(closed('deepseek'), failure('model_unavailable'));
    for (let index = 0; index < 3; index += 1) await breaker.recordFailure(closed('openrouter'), failure('timeout'));

    expect(await breaker.tryAcquire('deepseek')).toEqual({ isAllowed: false, isProviderWide: true });
    expect(await breaker.tryAcquire('openrouter')).toEqual({ isAllowed: false, isProviderWide: false });
  });

  it('ignores request-specific failures', async () => {
    const { breaker } = setup();
    for (let index = 0; index < 5; index += 1) await breaker.recordFailure(closed('deepseek'), failure('bad_request'));

    expect(await isAllowed(breaker, 'deepseek')).toBe(true);
  });

  it('falls back to in-process state when the shared store throws', async () => {
    const broken: BreakerStore = {
      get: vi.fn().mockRejectedValue(new Error('redis down')),
      setIfAbsent: vi.fn().mockRejectedValue(new Error('redis down')),
      set: vi.fn().mockRejectedValue(new Error('redis down')),
      increment: vi.fn().mockRejectedValue(new Error('redis down')),
      delete: vi.fn().mockRejectedValue(new Error('redis down')),
      deleteIfEqual: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const logger = silentLogger();
    const store = createFallbackBreakerStore({ resolvePrimary: () => broken, fallback: createMemoryBreakerStore(), logger });
    const breaker = createCircuitBreaker({ store, config: breakerConfig, logger });

    await breaker.recordFailure(closed('deepseek'), failure('insufficient_balance'));

    expect(await isAllowed(breaker, 'deepseek')).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
