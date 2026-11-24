import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { enhancePrompt } = vi.hoisted(() => ({ enhancePrompt: vi.fn() }));
vi.mock('../../src/services/deepseekService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/deepseekService.js')>()),
  enhancePrompt,
}));

import sandboxRouter from '../../src/routes/sandbox.js';
import variationsRouter from '../../src/routes/variations.js';
import workflowsRouter from '../../src/routes/workflows.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

const app = express();
app.use(express.json());
app.use('/sandbox', sandboxRouter);
app.use('/workflows', workflowsRouter);
app.use('/variations', variationsRouter);

let subscriber: TestUser;

function utcToday(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

async function setGenerationsToday(promptCount: number): Promise<void> {
  await prisma.dailyUsage.upsert({
    where: { userId_date: { userId: subscriber.id, date: utcToday() } },
    update: { promptCount },
    create: { userId: subscriber.id, date: utcToday(), promptCount },
  });
}

async function generationsToday(): Promise<number> {
  const row = await prisma.dailyUsage.findUnique({
    where: { userId_date: { userId: subscriber.id, date: utcToday() } },
  });
  return row?.promptCount ?? 0;
}

async function waitFor<T>(read: () => Promise<T>, isDone: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const value = await read();
    if (isDone(value)) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const authorized = (req: request.Test) => req.set('Authorization', `Bearer ${subscriber.accessToken}`);

beforeAll(async () => {
  subscriber = await createTestUser();
  await prisma.subscription.create({
    data: {
      userId: subscriber.id,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
});

beforeEach(async () => {
  enhancePrompt.mockReset().mockResolvedValue({
    enhancedPrompt: 'enhanced',
    model: 'test-model',
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    processingMs: 1,
  });
  await prisma.dailyUsage.deleteMany({ where: { userId: subscriber.id } });
});

afterAll(async () => {
  await prisma.dailyUsage.deleteMany({ where: { userId: subscriber.id } });
  await cleanupUser(subscriber.id);
});

describe('workflow execution', () => {
  it('rejects a workflow with more steps than one execution may run', async () => {
    const steps = Array.from({ length: 11 }, (_, index) => ({ name: `s${index}`, promptTemplate: 'Hi' }));

    const response = await authorized(request(app).post('/workflows')).send({ name: 'Too long', steps });

    expect(response.status).toBe(400);
  });

  it('charges every provider call and stops at the daily allowance', async () => {
    await setGenerationsToday(298);
    const steps = Array.from({ length: 3 }, (_, index) => ({ name: `s${index}`, promptTemplate: 'Hi' }));
    const created = await authorized(request(app).post('/workflows')).send({ name: 'Three steps', steps });

    const started = await authorized(request(app).post(`/workflows/${created.body.data.id}/execute`)).send({
      maxRetries: 1,
    });
    const execution = await waitFor(
      () => prisma.workflowExecution.findUnique({ where: { id: started.body.data.id } }),
      (value) => value?.status === 'failed' || value?.status === 'completed',
    );

    expect(execution?.status).toBe('failed');
    expect(execution?.error).toContain('Daily fair-use limit reached');
    expect(enhancePrompt).toHaveBeenCalledTimes(2);
    expect(await generationsToday()).toBe(300);
  });
});

describe('sandbox tests', () => {
  it('runs each platform once and returns the allowance of a failed provider call', async () => {
    const response = await authorized(request(app).post('/sandbox')).send({
      testPrompt: 'Say hi',
      platforms: ['CHATGPT', 'CHATGPT', 'MIDJOURNEY'],
    });

    expect(response.status).toBe(201);
    expect(response.body.data.platforms).toEqual(['CHATGPT', 'MIDJOURNEY']);
    const results = await waitFor(
      () => prisma.platformTestResult.findMany({ where: { testId: response.body.data.id } }),
      (rows) => rows.length === 2,
    );
    expect(results).toHaveLength(2);
    expect(await generationsToday()).toBe(0);
  });
});

describe('variation generation', () => {
  it('rejects more variants than one request may generate', async () => {
    const variants = Array.from({ length: 21 }, (_, index) => ({ label: `v${index}`, mode: 'standard' }));

    const response = await authorized(request(app).post('/variations/generate')).send({
      prompt: 'Write a haiku',
      config: { variants },
    });

    expect(response.status).toBe(400);
  });
});
