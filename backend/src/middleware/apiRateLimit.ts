/**
 * API Rate Limiting Middleware
 *
 * Per-key rate limiting using Redis sliding window algorithm.
 * Falls back to in-memory limiting if Redis is unavailable.
 */

import { Response, NextFunction } from 'express';
import { getRedis, isRedisAvailable } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import type { ApiKeyRequest } from './apiKeyAuth.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const WINDOW_SIZE_MS = parseInt(process.env['API_RATE_LIMIT_WINDOW_MS'] || '60000', 10); // 1 minute
const DEFAULT_RATE_LIMIT = parseInt(process.env['API_DEFAULT_RATE_LIMIT'] || '60', 10);

// In-memory fallback storage
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup interval for memory store (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// RATE LIMIT HEADERS
// ============================================================================

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
}

function setRateLimitHeaders(res: Response, info: RateLimitInfo): void {
  res.set({
    'X-RateLimit-Limit': info.limit.toString(),
    'X-RateLimit-Remaining': Math.max(0, info.remaining).toString(),
    'X-RateLimit-Reset': info.reset.toString(),
    'X-RateLimit-Policy': `${info.limit};w=${WINDOW_SIZE_MS / 1000}`,
  });
}

// ============================================================================
// REDIS SLIDING WINDOW
// ============================================================================

async function checkRateLimitRedis(
  keyId: string,
  limit: number
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  const redis = getRedis() as ReturnType<typeof import('redis').createClient>;
  const now = Date.now();
  const windowStart = now - WINDOW_SIZE_MS;
  const redisKey = `ratelimit:api:${keyId}`;

  try {
    // Use Redis sorted set for sliding window
    // Score = timestamp, Member = unique request ID
    const pipeline = redis.multi();

    // Remove expired entries
    pipeline.zRemRangeByScore(redisKey, 0, windowStart);

    // Count current entries
    pipeline.zCard(redisKey);

    // Add new entry if under limit (we'll check after)
    pipeline.zAdd(redisKey, { score: now, value: `${now}:${Math.random()}` });

    // Set expiry on the key
    pipeline.expire(redisKey, Math.ceil(WINDOW_SIZE_MS / 1000) + 1);

    const results = await pipeline.exec();

    // Get count from second command result (zCard returns a number)
    const count = typeof results?.[1] === 'number' ? results[1] : (Number(results?.[1]) || 0);
    const resetAt = Math.ceil((now + WINDOW_SIZE_MS) / 1000);

    if (count >= limit) {
      // Over limit - remove the entry we just added
      await redis.zRemRangeByScore(redisKey, now, now);

      return {
        allowed: false,
        info: {
          limit,
          remaining: 0,
          reset: resetAt,
        },
      };
    }

    return {
      allowed: true,
      info: {
        limit,
        remaining: limit - count - 1,
        reset: resetAt,
      },
    };
  } catch (error) {
    logger.error({ error, keyId }, 'Redis rate limit error; using in-memory fail-safe limiter');
    return checkRateLimitMemory(keyId, limit);
  }
}

// ============================================================================
// MEMORY FALLBACK
// ============================================================================

function checkRateLimitMemory(
  keyId: string,
  limit: number
): { allowed: boolean; info: RateLimitInfo } {
  const now = Date.now();
  const resetAt = Math.ceil((now + WINDOW_SIZE_MS) / 1000);
  const key = `ratelimit:api:${keyId}`;

  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt < now) {
    // New window
    memoryStore.set(key, { count: 1, resetAt: now + WINDOW_SIZE_MS });
    return {
      allowed: true,
      info: { limit, remaining: limit - 1, reset: resetAt },
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      info: { limit, remaining: 0, reset: Math.ceil(existing.resetAt / 1000) },
    };
  }

  existing.count++;
  return {
    allowed: true,
    info: { limit, remaining: limit - existing.count, reset: Math.ceil(existing.resetAt / 1000) },
  };
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Rate limit middleware for API key authenticated requests.
 * Uses the per-key rate limit configured on the API key.
 */
export const apiRateLimit = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip if no API key (should be caught by auth middleware)
  if (!req.apiKey) {
    next();
    return;
  }

  const limit = req.apiKey.rateLimit || DEFAULT_RATE_LIMIT;
  const keyId = req.apiKey.id;

  let result: { allowed: boolean; info: RateLimitInfo };

  if (isRedisAvailable()) {
    result = await checkRateLimitRedis(keyId, limit);
  } else {
    result = checkRateLimitMemory(keyId, limit);
  }

  // Always set headers
  setRateLimitHeaders(res, result.info);

  if (!result.allowed) {
    logger.warn({ keyId, limit }, 'API rate limit exceeded');

    res.status(429).json({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `You have exceeded ${limit} requests per minute. Please slow down.`,
      retryAfter: result.info.reset - Math.floor(Date.now() / 1000),
    });
    return;
  }

  next();
};

/**
 * Factory for custom rate limits on specific endpoints.
 */
export const customRateLimit = (requestsPerMinute: number) => {
  return async (
    req: ApiKeyRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.apiKey) {
      next();
      return;
    }

    // Use the lower of custom limit and key limit
    const limit = Math.min(requestsPerMinute, req.apiKey.rateLimit || DEFAULT_RATE_LIMIT);
    const keyId = `${req.apiKey.id}:${req.path}`;

    let result: { allowed: boolean; info: RateLimitInfo };

    if (isRedisAvailable()) {
      result = await checkRateLimitRedis(keyId, limit);
    } else {
      result = checkRateLimitMemory(keyId, limit);
    }

    setRateLimitHeaders(res, result.info);

    if (!result.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: result.info.reset - Math.floor(Date.now() / 1000),
      });
      return;
    }

    next();
  };
};

/**
 * Get current rate limit status for an API key.
 */
export async function getRateLimitStatus(keyId: string, limit: number): Promise<RateLimitInfo> {
  const now = Date.now();
  const resetAt = Math.ceil((now + WINDOW_SIZE_MS) / 1000);

  if (!isRedisAvailable()) {
    const key = `ratelimit:api:${keyId}`;
    const existing = memoryStore.get(key);

    if (!existing || existing.resetAt < now) {
      return { limit, remaining: limit, reset: resetAt };
    }

    return {
      limit,
      remaining: Math.max(0, limit - existing.count),
      reset: Math.ceil(existing.resetAt / 1000),
    };
  }

  try {
    const redis = getRedis() as ReturnType<typeof import('redis').createClient>;
    const redisKey = `ratelimit:api:${keyId}`;
    const windowStart = now - WINDOW_SIZE_MS;

    await redis.zRemRangeByScore(redisKey, 0, windowStart);
    const count = await redis.zCard(redisKey);

    return {
      limit,
      remaining: Math.max(0, limit - count),
      reset: resetAt,
    };
  } catch (error) {
    logger.error({ error, keyId }, 'Error getting rate limit status');
    return { limit, remaining: limit, reset: resetAt };
  }
}
