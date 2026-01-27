/**
 * Redis caching layer for enterprise scaling.
 *
 * SETUP REQUIRED:
 * 1. Install dependencies: npm install redis
 * 2. Set REDIS_URL in environment
 * 3. Call initRedis() in index.ts startup
 *
 * This module gracefully degrades if Redis is not available.
 */

import { logger } from './logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;
let redisAvailable = false;

export async function initRedis(): Promise<unknown> {
  const redisUrl = process.env['REDIS_URL'];

  if (!redisUrl) {
    logger.warn('REDIS_URL not configured - running without cache');
    return null;
  }

  try {
    // Dynamic import to make redis optional
    const redis = await import('redis');
    const { createClient } = redis;

    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error('Redis connection failed after 10 retries');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    redisClient.on('error', (err: Error) => {
      logger.error({ err }, 'Redis client error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
      redisAvailable = true;
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis reconnecting...');
    });

    await redisClient.connect();
    redisAvailable = true;
    return redisClient;
  } catch (error) {
    logger.warn({ error }, 'Redis not available - caching disabled');
    return null;
  }
}

export function getRedis(): unknown {
  return redisClient;
}

export function isRedisAvailable(): boolean {
  return redisAvailable && redisClient !== null;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
  }
}

// Cache helper functions - gracefully degrade if Redis not available
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redisAvailable || !redisClient) return null;
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
    if (!redisAvailable || !redisClient) return;
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
    }
  },

  async del(key: string): Promise<void> {
    if (!redisAvailable || !redisClient) return;
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
    }
  },

  async invalidatePattern(pattern: string): Promise<void> {
    if (!redisAvailable || !redisClient) return;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      logger.error({ error, pattern }, 'Cache invalidate pattern error');
    }
  },

  // Subscription info cache (5 min TTL)
  async getSubscription(userId: string) {
    return this.get<SubscriptionCache>(`sub:${userId}`);
  },

  async setSubscription(userId: string, data: SubscriptionCache) {
    await this.set(`sub:${userId}`, data, 300);
  },

  async invalidateSubscription(userId: string) {
    await this.del(`sub:${userId}`);
  },

  // Daily usage cache (updates frequently, 1 min TTL)
  async getDailyUsage(userId: string, date: string) {
    return this.get<DailyUsageCache>(`usage:${userId}:${date}`);
  },

  async setDailyUsage(userId: string, date: string, data: DailyUsageCache) {
    await this.set(`usage:${userId}:${date}`, data, 60);
  },

  async invalidateDailyUsage(userId: string, date: string) {
    await this.del(`usage:${userId}:${date}`);
  },

  // User session cache (15 min TTL - matches access token)
  async getUser(userId: string) {
    return this.get<UserCache>(`user:${userId}`);
  },

  async setUser(userId: string, data: UserCache) {
    await this.set(`user:${userId}`, data, 900);
  },

  async invalidateUser(userId: string) {
    await this.del(`user:${userId}`);
  },
};

// Cache type definitions
interface SubscriptionCache {
  tier: string;
  status: string;
  expiresAt: string | null;
  dailyLimit: number;
  maxTokens: number;
  promptQuality: string;
}

interface DailyUsageCache {
  promptCount: number;
  date: string;
}

interface UserCache {
  id: string;
  email: string;
  isActive: boolean;
  tokenVersion: number;
  subscriptionTier: string;
}
