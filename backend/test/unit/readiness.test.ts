import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  database: vi.fn(), redisAvailable: vi.fn(), ping: vi.fn(), migrations: vi.fn(),
}));
vi.mock('../../src/utils/prisma.js', () => ({ prisma: { $queryRaw: mocks.database } }));
vi.mock('../../src/utils/redis.js', () => ({ isRedisAvailable: mocks.redisAvailable, getRedis: () => ({ ping: mocks.ping }) }));
vi.mock('../../src/utils/logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/utils/queue.js', () => ({ queues: {} }));
vi.mock('../../src/utils/env.js', () => ({ getMissingRequiredEnvVars: () => [] }));
vi.mock('../../src/services/bootStatusService.js', () => ({ getMigrationBootStatus: mocks.migrations }));
import { healthRouter } from '../../src/routes/health.js';

const app = express().use('/health', healthRouter);
beforeEach(() => {
  mocks.database.mockResolvedValue([{ '?column?': 1 }]);
  mocks.redisAvailable.mockReturnValue(true);
  mocks.ping.mockResolvedValue('PONG');
  mocks.migrations.mockReturnValue('ok');
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('deployment readiness', () => {
  it('rejects a failed schema migration even when the database responds', async () => {
    mocks.migrations.mockReturnValue('failed_at_boot');
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.reason).toBe('database_migrations_failed');
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it('rejects configured Redis while disconnected rather than silently skipping it', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    mocks.redisAvailable.mockReturnValue(false);
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.reason).toBe('redis_unavailable');
  });
  it('rejects a database connection failure', async () => {
    mocks.database.mockRejectedValue(new Error('connection refused'));
    expect((await request(app).get('/health/ready')).status).toBe(503);
  });
  it('is ready when schema, database, and configured Redis are ready', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(mocks.ping).toHaveBeenCalledOnce();
  });
});
