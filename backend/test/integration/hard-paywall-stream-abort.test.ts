import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { StreamCallbacks } from '../../src/services/deepseekService.js';

const { upstreamSignals, scenario } = vi.hoisted(() => ({
  upstreamSignals: [] as AbortSignal[],
  scenario: { failsBeforeFirstToken: false },
}));

// The upstream generation finishes only after the caller aborts: the race
// must not persist a turn, but the tokens already delivered stay charged.
vi.mock('../../src/services/deepseekService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/deepseekService.js')>();
  return {
    ...original,
    enhancePromptInThreadStream: async (_request: unknown, callbacks: StreamCallbacks) => {
      const signal = callbacks.signal;
      if (!signal) throw new Error('thread stream called without an AbortSignal');
      upstreamSignals.push(signal);
      if (scenario.failsBeforeFirstToken) {
        await callbacks.onError(new Error('provider unavailable'));
        return;
      }
      await callbacks.onToken('partial');
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      await callbacks.onComplete({
        enhancedPrompt: 'finished after the client left',
        model: 'test-model',
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        processingMs: 1,
      });
    },
  };
});

import { threadRouter } from '../../src/routes/threads.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

let server: Server;
let subscriber: TestUser;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/threads', threadRouter);
  server = app.listen(0);
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

afterAll(async () => {
  server.close();
  await prisma.dailyUsage.deleteMany({ where: { userId: subscriber.id } });
  await cleanupUser(subscriber.id);
});

function openStreamAndDisconnect(path: string, body: unknown): Promise<void> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${subscriber.accessToken}`,
        },
      },
      (res) => {
        res.once('data', () => {
          req.destroy();
          resolve();
        });
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    req.end(JSON.stringify(body));
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function generationsToday(): Promise<number> {
  const rows = await prisma.dailyUsage.findMany({ where: { userId: subscriber.id } });
  return rows.reduce((sum, row) => sum + row.promptCount, 0);
}

describe('thread stream client disconnect', () => {
  it('aborts the upstream generation, persists nothing, and charges the delivered output', async () => {
    await openStreamAndDisconnect('/api/v1/threads', { prompt: 'write a haiku' });

    await waitFor(() => upstreamSignals[0]?.aborted === true);
    // Give the post-abort onComplete a chance to (wrongly) write.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const [threads, generations] = await Promise.all([
      prisma.thread.count({ where: { userId: subscriber.id } }),
      generationsToday(),
    ]);
    expect(threads).toBe(0);
    expect(generations).toBe(1);
  });

  it('returns the reserved generation when the provider fails before any output', async () => {
    await prisma.dailyUsage.deleteMany({ where: { userId: subscriber.id } });
    scenario.failsBeforeFirstToken = true;

    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://localhost:${port}/api/v1/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${subscriber.accessToken}` },
      body: JSON.stringify({ prompt: 'write a haiku' }),
    });
    await response.text();

    expect(await generationsToday()).toBe(0);
  });
});
