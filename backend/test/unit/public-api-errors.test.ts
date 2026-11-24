import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enhancePrompt: vi.fn(),
  enhancePromptStream: vi.fn(),
  passThrough: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
vi.mock('../../src/middleware/apiKeyAuth.js', () => ({
  apiKeyAuth: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { apiKey: { id: 'key_1', developerId: 'dev_1', permissions: ['enhance'] } });
    next();
  },
  requirePermission: () => mocks.passThrough,
}));
vi.mock('../../src/middleware/apiRateLimit.js', () => ({ apiRateLimit: mocks.passThrough }));
vi.mock('../../src/middleware/apiQuotaEnforcement.js', () => ({
  enforceApiQuota: mocks.passThrough,
  recordApiUsage: vi.fn().mockResolvedValue(undefined),
  getQuotaInfo: vi.fn().mockResolvedValue({ quota: {} }),
}));
vi.mock('../../src/services/apiSubscriptionService.js', () => ({
  getApiSubscriptionInfo: vi.fn().mockResolvedValue({ tier: 'API_PRO' }),
  getTierConfig: vi.fn().mockReturnValue({}),
}));
vi.mock('../../src/services/apiUsageService.js', () => ({ getRecentUsage: vi.fn() }));
vi.mock('../../src/utils/prisma.js', () => ({ prisma: {} }));
vi.mock('../../src/utils/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/services/deepseekService.js', () => ({
  enhancePrompt: mocks.enhancePrompt,
  enhancePromptStream: mocks.enhancePromptStream,
  getPromptTierFromSubscription: vi.fn(),
}));

import { ProviderError } from '../../src/features/llm/errors.js';
import { publicApiRouter } from '../../src/routes/publicApi.js';

const app = express().use(express.json()).use('/public', publicApiRouter);
const vendorFailure = () =>
  new ProviderError({
    kind: 'overloaded',
    provider: 'gateway',
    message: 'all LLM providers are circuit-open (deepseek, openrouter)',
  });

afterEach(() => vi.clearAllMocks());

describe('public API enhancement errors', () => {
  it('returns the sanitized copy and a status matching the failure for a JSON request', async () => {
    mocks.enhancePrompt.mockRejectedValue(vendorFailure());

    const response = await request(app).post('/public/enhance').send({ prompt: 'Write a haiku' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'ENHANCEMENT_ERROR', reason: 'PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify(response.body)).not.toMatch(/deepseek|openrouter|circuit/i);
  });

  it('streams the sanitized error event without upstream details', async () => {
    mocks.enhancePromptStream.mockImplementation(
      async (_input: unknown, callbacks: { onError: (error: Error) => void }) => {
        callbacks.onError(vendorFailure());
      },
    );

    const response = await request(app).post('/public/enhance').send({ prompt: 'Write a haiku', stream: true });

    expect(response.text).toContain('"code":"PROVIDER_UNAVAILABLE"');
    expect(response.text).not.toMatch(/deepseek|openrouter|circuit/i);
  });
});
