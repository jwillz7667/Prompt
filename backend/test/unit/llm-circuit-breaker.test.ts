import { describe, expect, it, vi } from 'vitest';

import {
  createCircuitBreaker,
  createFallbackBreakerStore,
  createMemoryBreakerStore,
  type BreakerStore,
} from '../../src/features/llm/circuit-breaker.js';
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

    await breaker.recordFailure('deepseek', failure('insufficient_balance'));
    await breaker.recordFailure('deepseek', failure('insufficient_balance'));

    expect(await breaker.tryAcquire('deepseek')).toBe(false);
    expect(logger.error).toHaveBeenCalledOnce();
    advance(299_000);
    expect(await breaker.tryAcquire('deepseek')).toBe(false);
  });

  it('opens after three transient failures inside the window', async () => {
    const { breaker } = setup();

    await breaker.recordFailure('openrouter', failure('overloaded'));
    await breaker.recordFailure('openrouter', failure('timeout'));
    expect(await breaker.tryAcquire('openrouter')).toBe(true);
    await breaker.recordFailure('openrouter', failure('rate_limited'));

    expect(await breaker.tryAcquire('openrouter')).toBe(false);
  });

  it('forgets transient failures once the window lapses', async () => {
    const { breaker, advance } = setup();

    await breaker.recordFailure('local', failure('overloaded'));
    await breaker.recordFailure('local', failure('overloaded'));
    advance(31_000);
    await breaker.recordFailure('local', failure('overloaded'));

    expect(await breaker.tryAcquire('local')).toBe(true);
  });

  it('allows exactly one half-open probe and closes on its success', async () => {
    const { breaker, advance } = setup();
    for (let index = 0; index < 3; index += 1) await breaker.recordFailure('deepseek', failure('timeout'));
    advance(30_001);

    expect(await breaker.tryAcquire('deepseek')).toBe(true);
    expect(await breaker.tryAcquire('deepseek')).toBe(false);
    await breaker.recordSuccess('deepseek');

    expect(await breaker.tryAcquire('deepseek')).toBe(true);
    expect(await breaker.tryAcquire('deepseek')).toBe(true);
  });

  it('reopens immediately when the half-open probe fails', async () => {
    const { breaker, advance } = setup();
    await breaker.recordFailure('deepseek', failure('auth'));
    advance(300_001);
    expect(await breaker.tryAcquire('deepseek')).toBe(true);

    await breaker.recordFailure('deepseek', failure('overloaded'));

    expect(await breaker.tryAcquire('deepseek')).toBe(false);
  });

  it('ignores request-specific failures', async () => {
    const { breaker } = setup();
    for (let index = 0; index < 5; index += 1) await breaker.recordFailure('deepseek', failure('bad_request'));

    expect(await breaker.tryAcquire('deepseek')).toBe(true);
  });

  it('falls back to in-process state when the shared store throws', async () => {
    const broken: BreakerStore = {
      get: vi.fn().mockRejectedValue(new Error('redis down')),
      setIfAbsent: vi.fn().mockRejectedValue(new Error('redis down')),
      set: vi.fn().mockRejectedValue(new Error('redis down')),
      increment: vi.fn().mockRejectedValue(new Error('redis down')),
      delete: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const logger = silentLogger();
    const store = createFallbackBreakerStore({ resolvePrimary: () => broken, fallback: createMemoryBreakerStore(), logger });
    const breaker = createCircuitBreaker({ store, config: breakerConfig, logger });

    await breaker.recordFailure('deepseek', failure('insufficient_balance'));

    expect(await breaker.tryAcquire('deepseek')).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
