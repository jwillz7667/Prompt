/**
 * Per-user daily chat ceiling. Redis holds an atomic counter that is reserved
 * before a model call and released when the call produced nothing, so a
 * provider outage never consumes a user's allowance. Without Redis the day's
 * persisted user messages are counted instead (not atomic, but bounded).
 */

export interface FairUseCounterClient {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface FairUseReservation {
  /** Returns the slot; idempotent, so every failure path may call it. */
  release(): Promise<void>;
}

export type FairUseResult =
  | { isAllowed: true; reservation: FairUseReservation }
  | { isAllowed: false; resetAt: Date };

export interface FairUseLimiter {
  reserve(userId: string, now?: Date): Promise<FairUseResult>;
}

export interface FairUseLogger {
  warn(fields: Record<string, unknown>, message: string): void;
}

export interface FairUseDeps {
  dailyLimit: number;
  /** Current Redis client, or undefined while Redis is unavailable. */
  resolveClient: () => FairUseCounterClient | undefined;
  /** Fallback: user messages persisted since `since`. */
  countMessagesSince: (userId: string, since: Date) => Promise<number>;
  logger: FairUseLogger;
}

// One key per UTC day, so no invalidation is needed; the TTL only garbage-collects.
const COUNTER_TTL_SECONDS = 48 * 60 * 60;

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function nextUtcMidnight(now: Date): Date {
  return new Date(utcDayStart(now).getTime() + 86_400_000);
}

export function chatUsageKey(userId: string, now: Date = new Date()): string {
  return `usage:chat:v1:${userId}:${now.toISOString().slice(0, 10)}`;
}

export function isFairUseCounterClient(value: unknown): value is FairUseCounterClient {
  if (typeof value !== 'object' || value === null) return false;
  return ['incr', 'decr', 'expire'].every(
    (method) => typeof Reflect.get(value, method) === 'function',
  );
}

const NO_OP_RESERVATION: FairUseReservation = { release: () => Promise.resolve() };

export function createFairUseLimiter(deps: FairUseDeps): FairUseLimiter {
  const reserveInDatabase = async (userId: string, now: Date): Promise<FairUseResult> => {
    const used = await deps.countMessagesSince(userId, utcDayStart(now));
    return used >= deps.dailyLimit
      ? { isAllowed: false, resetAt: nextUtcMidnight(now) }
      : { isAllowed: true, reservation: NO_OP_RESERVATION };
  };

  return {
    async reserve(userId, now = new Date()) {
      const client = deps.resolveClient();
      if (!client) return reserveInDatabase(userId, now);

      const key = chatUsageKey(userId, now);
      let count: number;
      try {
        count = await client.incr(key);
        await client.expire(key, COUNTER_TTL_SECONDS);
      } catch (error) {
        deps.logger.warn(
          { err: error, userId },
          'Chat fair-use counter unavailable; using database',
        );
        return reserveInDatabase(userId, now);
      }

      const decrement = async (): Promise<void> => {
        try {
          await client.decr(key);
        } catch (error) {
          deps.logger.warn({ err: error, userId }, 'Failed to release chat fair-use slot');
        }
      };

      if (count > deps.dailyLimit) {
        await decrement();
        return { isAllowed: false, resetAt: nextUtcMidnight(now) };
      }

      let isReleased = false;
      return {
        isAllowed: true,
        reservation: {
          async release() {
            if (isReleased) return;
            isReleased = true;
            await decrement();
          },
        },
      };
    },
  };
}
