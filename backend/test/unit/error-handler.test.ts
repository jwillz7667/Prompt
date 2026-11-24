import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({ logger: { error: vi.fn() } }));
vi.mock('../../src/utils/sentry.js', () => ({ captureError: vi.fn() }));

import { ProviderError } from '../../src/features/llm/errors.js';
import { createError, errorHandler } from '../../src/middleware/errorHandler.js';

function appThrowing(error: Error) {
  return express()
    .get('/boom', () => {
      throw error;
    })
    .use(errorHandler);
}

describe('global error handler', () => {
  it('hides the internal message of an unexpected 5xx behind generic copy', async () => {
    const internal = Object.assign(new Error('connect ECONNREFUSED 10.0.0.4:5432 (prisma)'), { code: 'P1001' });

    const response = await request(appThrowing(internal)).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  it('keeps the client-facing message and code of a 4xx created with createError', async () => {
    const response = await request(appThrowing(createError('Workflow not found', 404, 'NOT_FOUND'))).get('/boom');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Workflow not found', code: 'NOT_FOUND' });
  });

  it('maps a provider failure to its sanitized client error without vendor names', async () => {
    const failure = new ProviderError({ kind: 'insufficient_balance', provider: 'deepseek', message: 'deepseek HTTP 402' });

    const response = await request(appThrowing(failure)).get('/boom');

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toMatch(/deepseek|402/i);
  });
});
