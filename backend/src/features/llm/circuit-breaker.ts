import { randomUUID } from 'node:crypto';

import type { LlmBreakerConfig, LlmProviderName } from './config.js';
import type { ProviderError, ProviderErrorKind } from './errors.js';
import type { LlmLogger } from './openai-compatible-provider.js';

/**
 * Minimal key/value surface the breaker needs. Every operation is a single
 * atomic Redis command so concurrent instances never need a transaction.
 */
export interface BreakerStore {
  get(key: string): Promise<string | null>;
  /** SET NX PX — true when this caller created the key. */
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** INCR, applying `ttlMs` only when the key was just created (fixed window). */
  increment(key: string, ttlMs: number): Promise<number>;
  delete(keys: string[]): Promise<void>;
  /** Deletes `key` only while it still holds `value` (atomic compare-and-delete). */
  deleteIfEqual(key: string, value: string): Promise<void>;
}

/** Proof that a caller may use a provider; `probeToken` is set only for the half-open probe. */
export interface BreakerPermit {
  readonly provider: LlmProviderName;
  readonly probeToken: string | undefined;
}

export type BreakerDecision =
  | { isAllowed: true; permit: BreakerPermit }
  /**
   * `isProviderWide` is true while the provider is open for billing, auth,
   * configuration or model errors, where another attempt cannot succeed.
   */
  | { isAllowed: false; isProviderWide: boolean };

export interface CircuitBreaker {
  /** Denied while open; in half-open state only one caller cluster-wide is allowed. */
  tryAcquire(provider: LlmProviderName): Promise<BreakerDecision>;
  recordSuccess(permit: BreakerPermit): Promise<void>;
  recordFailure(permit: BreakerPermit, error: ProviderError): Promise<void>;
  /** Outcome says nothing about provider health (caller abort, bad request): free this caller's probe slot. */
  release(permit: BreakerPermit): Promise<void>;
}

/**
 * A permit for an attempt made without acquiring the breaker (the gateway's
 * last resort when no other provider is available). It never owns the probe.
 */
export function bypassPermit(provider: LlmProviderName): BreakerPermit {
  return { provider, probeToken: undefined };
}

const TRANSIENT_KINDS: ReadonlySet<ProviderErrorKind> = new Set([
  'rate_limited',
  'overloaded',
  'timeout',
  'interrupted',
]);

// After an open window lapses, the "tripped" marker lingers this long so the
// next request is treated as a single half-open probe rather than full traffic.
const HALF_OPEN_MEMORY_MS = 10 * 60_000;
// One in-flight probe at a time; the lease expires on its own if the probing
// instance dies mid-request. Matches the default total request deadline.
const PROBE_LEASE_MS = 180_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

const PROVIDER_WIDE_KINDS: ReadonlySet<string> = new Set<ProviderErrorKind>([
  'insufficient_balance',
  'auth',
  'not_configured',
  'model_unavailable',
]);

function isProviderWideMarker(marker: string): boolean {
  try {
    const parsed: unknown = JSON.parse(marker);
    const kind =
      typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'kind') : undefined;
    return typeof kind === 'string' && PROVIDER_WIDE_KINDS.has(kind);
  } catch {
    return false;
  }
}

function keysFor(provider: LlmProviderName) {
  const base = `llm:cb:v1:${provider}`;
  return {
    open: base,
    tripped: `${base}:tripped`,
    probe: `${base}:probe`,
    failures: `${base}:failures`,
  };
}

export function createCircuitBreaker(deps: {
  store: BreakerStore;
  config: LlmBreakerConfig;
  logger: LlmLogger;
}): CircuitBreaker {
  const { store, config, logger } = deps;

  const open = async (
    provider: LlmProviderName,
    error: ProviderError,
    cooldownMs: number,
  ): Promise<void> => {
    const keys = keysFor(provider);
    const marker = JSON.stringify({ kind: error.kind, status: error.status ?? null, cooldownMs });
    // TTL = cooldown: the open state ends by expiry, no sweeper needed.
    const opened = await store.setIfAbsent(keys.open, marker, cooldownMs);
    // TTL = cooldown + memory: outlives the open window so recovery is probed.
    await store.set(keys.tripped, '1', cooldownMs + HALF_OPEN_MEMORY_MS);
    await store.delete([keys.probe, keys.failures]);
    if (!opened) return;
    const fields = {
      provider,
      kind: error.kind,
      status: error.status,
      cooldownMs,
    };
    if (error.isProviderWide) {
      logger.error(fields, 'LLM provider circuit opened: provider unusable (billing/auth/config)');
    } else {
      logger.warn(fields, 'LLM provider circuit opened after repeated transient failures');
    }
  };

  const releaseProbe = async (permit: BreakerPermit): Promise<void> => {
    // Only the caller that won the half-open lease may free it; an attempt
    // acquired while the circuit was closed must not free a later probe.
    if (permit.probeToken === undefined) return;
    await store.deleteIfEqual(keysFor(permit.provider).probe, permit.probeToken);
  };

  return {
    async tryAcquire(provider) {
      const keys = keysFor(provider);
      const openMarker = await store.get(keys.open);
      if (openMarker !== null) {
        return { isAllowed: false, isProviderWide: isProviderWideMarker(openMarker) };
      }
      if ((await store.get(keys.tripped)) === null) {
        return { isAllowed: true, permit: { provider, probeToken: undefined } };
      }
      const probeToken = randomUUID();
      return (await store.setIfAbsent(keys.probe, probeToken, PROBE_LEASE_MS))
        ? { isAllowed: true, permit: { provider, probeToken } }
        : { isAllowed: false, isProviderWide: false };
    },

    async recordSuccess(permit) {
      const keys = keysFor(permit.provider);
      await store.delete([keys.open, keys.tripped, keys.probe, keys.failures]);
    },

    async recordFailure(permit, error) {
      const { provider } = permit;
      const keys = keysFor(provider);
      if (error.isProviderWide) {
        await open(provider, error, config.longCooldownMs);
        return;
      }
      if (!TRANSIENT_KINDS.has(error.kind)) {
        await releaseProbe(permit);
        return;
      }
      const cooldownMs =
        error.kind === 'rate_limited' && error.retryAfterMs !== undefined
          ? Math.min(
              Math.max(config.shortCooldownMs, error.retryAfterMs),
              MAX_RATE_LIMIT_COOLDOWN_MS,
            )
          : config.shortCooldownMs;
      // A failed half-open probe reopens immediately.
      if ((await store.get(keys.tripped)) !== null) {
        await open(provider, error, cooldownMs);
        return;
      }
      // TTL = failure window, set on the first failure only (fixed window).
      const failures = await store.increment(keys.failures, config.failureWindowMs);
      if (failures >= config.failureThreshold) await open(provider, error, cooldownMs);
    },

    release: releaseProbe,
  };
}

/** Single-process store; also the fallback whenever Redis is unreachable. */
export function createMemoryBreakerStore(now: () => number = Date.now): BreakerStore {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  const live = (key: string): { value: string; expiresAt: number } | undefined => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async get(key) {
      return live(key)?.value ?? null;
    },
    async setIfAbsent(key, value, ttlMs) {
      if (live(key)) return false;
      entries.set(key, { value, expiresAt: now() + ttlMs });
      return true;
    },
    async set(key, value, ttlMs) {
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
    async increment(key, ttlMs) {
      const entry = live(key);
      const next = entry ? Number(entry.value) + 1 : 1;
      entries.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? now() + ttlMs });
      return next;
    },
    async delete(keys) {
      for (const key of keys) entries.delete(key);
    },
    async deleteIfEqual(key, value) {
      if (live(key)?.value === value) entries.delete(key);
    },
  };
}

const COMPARE_AND_DELETE_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";

/** The node-redis v5 commands the breaker uses. */
export interface RedisBreakerClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { condition?: 'NX'; expiration: { type: 'PX'; value: number } },
  ): Promise<string | null>;
  incr(key: string): Promise<number>;
  pExpire(key: string, ms: number): Promise<number>;
  del(keys: string[]): Promise<number>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

export function isRedisBreakerClient(value: unknown): value is RedisBreakerClient {
  if (typeof value !== 'object' || value === null) return false;
  return ['get', 'set', 'incr', 'pExpire', 'del', 'eval'].every(
    (method) => typeof Reflect.get(value, method) === 'function',
  );
}

export function createRedisBreakerStore(client: RedisBreakerClient): BreakerStore {
  return {
    get: (key) => client.get(key),
    async setIfAbsent(key, value, ttlMs) {
      const reply = await client.set(key, value, {
        condition: 'NX',
        expiration: { type: 'PX', value: ttlMs },
      });
      return reply === 'OK';
    },
    async set(key, value, ttlMs) {
      await client.set(key, value, { expiration: { type: 'PX', value: ttlMs } });
    },
    async increment(key, ttlMs) {
      const count = await client.incr(key);
      if (count === 1) await client.pExpire(key, ttlMs);
      return count;
    },
    async delete(keys) {
      if (keys.length > 0) await client.del(keys);
    },
    async deleteIfEqual(key, value) {
      await client.eval(COMPARE_AND_DELETE_SCRIPT, { keys: [key], arguments: [value] });
    },
  };
}

/**
 * Uses the shared Redis store while it is reachable so every instance sees
 * the same breaker state, degrading to process-local state otherwise. A Redis
 * hiccup must never turn into an LLM outage.
 */
export function createFallbackBreakerStore(deps: {
  resolvePrimary: () => BreakerStore | undefined;
  fallback: BreakerStore;
  logger: LlmLogger;
}): BreakerStore {
  let isDegraded = false;
  const run = async <T>(operation: (store: BreakerStore) => Promise<T>): Promise<T> => {
    const primary = deps.resolvePrimary();
    if (primary) {
      try {
        const result = await operation(primary);
        isDegraded = false;
        return result;
      } catch (error) {
        if (!isDegraded) {
          deps.logger.warn({ err: error }, 'LLM breaker store unavailable; using in-process state');
          isDegraded = true;
        }
      }
    }
    return operation(deps.fallback);
  };
  return {
    get: (key) => run((store) => store.get(key)),
    setIfAbsent: (key, value, ttlMs) => run((store) => store.setIfAbsent(key, value, ttlMs)),
    set: (key, value, ttlMs) => run((store) => store.set(key, value, ttlMs)),
    increment: (key, ttlMs) => run((store) => store.increment(key, ttlMs)),
    delete: (keys) => run((store) => store.delete(keys)),
    deleteIfEqual: (key, value) => run((store) => store.deleteIfEqual(key, value)),
  };
}
