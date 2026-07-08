import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// The route layer is under test; the queue/engine layer is mocked so no job
// ever runs and no provider is ever called.
vi.mock('../../src/services/reflectionJobService.js', () => ({
  enqueueReflectionJob: vi.fn(),
  getReflectionJob: vi.fn(),
  subscribeToReflectionJob: vi.fn(),
}));

import {
  enqueueReflectionJob,
  getReflectionJob,
  subscribeToReflectionJob,
  type ReflectionJobResult,
  type ReflectionJobSnapshot,
} from '../../src/services/reflectionJobService.js';
import { optimizeRouter } from '../../src/routes/optimize.js';
import { createTestUser, cleanupUser, prisma, type TestUser } from './helpers.js';

const enqueueMock = vi.mocked(enqueueReflectionJob);
const getJobMock = vi.mocked(getReflectionJob);
const subscribeMock = vi.mocked(subscribeToReflectionJob);

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/optimize', optimizeRouter);
  return app;
}

const app = buildApp();

const fastPathResult: ReflectionJobResult = {
  status: 'fast_path',
  reason: 'free_tier',
  enhancedPrompt: 'Polished prompt',
  model: 'deepseek-v4-flash',
  usage: { inputTokens: 120, outputTokens: 240, llmCalls: 2 },
  promptId: null,
};

function snapshotFor(userId: string, overrides: Partial<ReflectionJobSnapshot> = {}): ReflectionJobSnapshot {
  return {
    jobId: 'opt_11111111-2222-3333-4444-555555555555',
    userId,
    status: 'completed',
    progress: [
      { phase: 'testing_candidates', label: 'Testing candidates…', rolloutsUsed: 0, at: new Date().toISOString() },
    ],
    result: fastPathResult,
    error: null,
    ...overrides,
  };
}

describe('reflection optimize routes', () => {
  let freeUser: TestUser;
  let proUser: TestUser;
  let quotaUser: TestUser;

  beforeAll(async () => {
    freeUser = await createTestUser();
    proUser = await createTestUser({ subscriptionTier: 'PRO' });
    quotaUser = await createTestUser();
    await prisma.subscription.create({
      data: { userId: proUser.id, tier: 'PRO', status: 'ACTIVE' },
    });
  });

  afterAll(async () => {
    await prisma.dailyUsage.deleteMany({ where: { userId: quotaUser.id } });
    await cleanupUser(freeUser.id);
    await cleanupUser(proUser.id);
    await cleanupUser(quotaUser.id);
    delete process.env['REFLECTION_LOOP_ENABLED'];
  });

  beforeEach(() => {
    process.env['REFLECTION_LOOP_ENABLED'] = 'true';
    vi.clearAllMocks();
    enqueueMock.mockResolvedValue('opt_11111111-2222-3333-4444-555555555555');
    getJobMock.mockResolvedValue(null);
    subscribeMock.mockResolvedValue(null);
  });

  describe('feature flag', () => {
    it('returns 404 with FEATURE_DISABLED when the flag is off', async () => {
      process.env['REFLECTION_LOOP_ENABLED'] = 'false';

      const res = await request(app)
        .post('/api/v1/optimize')
        .set('Authorization', `Bearer ${proUser.accessToken}`)
        .send({ raw_prompt: 'improve this' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('FEATURE_DISABLED');
      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('gates the read routes behind the flag too', async () => {
      delete process.env['REFLECTION_LOOP_ENABLED'];

      const res = await request(app)
        .get('/api/v1/optimize/opt_anything')
        .set('Authorization', `Bearer ${proUser.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('FEATURE_DISABLED');
    });
  });

  describe('POST /api/v1/optimize', () => {
    it('requires auth', async () => {
      const res = await request(app)
        .post('/api/v1/optimize')
        .send({ raw_prompt: 'improve this' });

      expect(res.status).toBe(401);
      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('returns 400 when raw_prompt is missing', async () => {
      const res = await request(app)
        .post('/api/v1/optimize')
        .set('Authorization', `Bearer ${proUser.accessToken}`)
        .send({ goal: 'make it better' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request data');
      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('enqueues the single-pass fast path for FREE tier', async () => {
      const res = await request(app)
        .post('/api/v1/optimize')
        .set('Authorization', `Bearer ${freeUser.accessToken}`)
        .send({ raw_prompt: 'write a poem about the sea', goal: 'evocative imagery' });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({
        jobId: 'opt_11111111-2222-3333-4444-555555555555',
        mode: 'fast_path',
      });
      expect(enqueueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: freeUser.id,
          mode: 'fast_path',
          singlePassTier: 'basic',
          rawPrompt: 'write a poem about the sea',
          goal: 'evocative imagery',
        })
      );
    });

    it('enqueues the full loop for PRO tier', async () => {
      const res = await request(app)
        .post('/api/v1/optimize')
        .set('Authorization', `Bearer ${proUser.accessToken}`)
        .send({ raw_prompt: 'write a poem about the sea', target_model_family: 'claude' });

      expect(res.status).toBe(202);
      expect(res.body.mode).toBe('full_loop');
      expect(enqueueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: proUser.id,
          mode: 'full_loop',
          singlePassTier: 'standard',
          targetModelFamily: 'claude',
        })
      );
    });

    it('returns 403 when the daily quota is exhausted', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailyUsage.create({
        data: { userId: quotaUser.id, date: today, promptCount: 10 },
      });

      const res = await request(app)
        .post('/api/v1/optimize')
        .set('Authorization', `Bearer ${quotaUser.accessToken}`)
        .send({ raw_prompt: 'improve this' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('QUOTA_EXCEEDED');
      expect(enqueueMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/optimize/:jobId', () => {
    it('returns 404 for an unknown job', async () => {
      const res = await request(app)
        .get('/api/v1/optimize/opt_missing')
        .set('Authorization', `Bearer ${proUser.accessToken}`);

      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's job without leaking existence", async () => {
      getJobMock.mockResolvedValue(snapshotFor(proUser.id));

      const res = await request(app)
        .get('/api/v1/optimize/opt_11111111-2222-3333-4444-555555555555')
        .set('Authorization', `Bearer ${freeUser.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });

    it("returns the owner's job state and result", async () => {
      getJobMock.mockResolvedValue(snapshotFor(proUser.id));

      const res = await request(app)
        .get('/api/v1/optimize/opt_11111111-2222-3333-4444-555555555555')
        .set('Authorization', `Bearer ${proUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.result.status).toBe('fast_path');
      expect(res.body.progress).toHaveLength(1);
      expect(res.body.userId).toBeUndefined();
    });
  });

  describe('GET /api/v1/optimize/:jobId/stream', () => {
    it("returns a plain 404 for another user's job before any SSE bytes", async () => {
      getJobMock.mockResolvedValue(snapshotFor(proUser.id));

      const res = await request(app)
        .get('/api/v1/optimize/opt_11111111-2222-3333-4444-555555555555/stream')
        .set('Authorization', `Bearer ${freeUser.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(subscribeMock).not.toHaveBeenCalled();
    });

    it('streams replayed progress, the result, and [DONE] for a finished job', async () => {
      getJobMock.mockResolvedValue(snapshotFor(proUser.id));
      subscribeMock.mockImplementation(async (_jobId, listener) => {
        listener({ type: 'progress', phase: 'testing_candidates', label: 'Testing candidates…', rolloutsUsed: 0 });
        listener({ type: 'progress', phase: 'packaging', label: 'Packaging results…', rolloutsUsed: 3 });
        listener({ type: 'result', result: fastPathResult });
        return () => undefined;
      });

      const res = await request(app)
        .get('/api/v1/optimize/opt_11111111-2222-3333-4444-555555555555/stream')
        .set('Authorization', `Bearer ${proUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('"type":"progress"');
      expect(res.text).toContain('"phase":"packaging"');
      expect(res.text).toContain('"type":"result"');
      expect(res.text).toContain('"enhancedPrompt":"Polished prompt"');
      expect(res.text).toContain('data: [DONE]');
    });

    it('emits an SSE error event when the job vanishes after the ownership check', async () => {
      getJobMock.mockResolvedValue(snapshotFor(proUser.id));
      subscribeMock.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/optimize/opt_11111111-2222-3333-4444-555555555555/stream')
        .set('Authorization', `Bearer ${proUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('"type":"error"');
      expect(res.text).not.toContain('data: [DONE]');
    });
  });
});
