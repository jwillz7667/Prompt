import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { StreamCallbacks } from '../../src/services/deepseekService.js';

const { upstreamSignals } = vi.hoisted(() => ({ upstreamSignals: [] as AbortSignal[] }));

// The upstream generation finishes only after the caller aborts, which is the
// race that must neither charge the user nor persist a turn.
vi.mock('../../src/services/deepseekService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/deepseekService.js')>();
  return {
    ...original,
    enhancePromptInThreadStream: async (_request: unknown, callbacks: StreamCallbacks) => {
      const signal = callbacks.signal;
      if (!signal) throw new Error('thread stream called without an AbortSignal');
      upstreamSignals.push(signal);
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

describe('thread stream client disconnect', () => {
  it('aborts the upstream generation and neither charges nor persists the turn', async () => {
    await openStreamAndDisconnect('/api/v1/threads', { prompt: 'write a haiku' });

    await waitFor(() => upstreamSignals[0]?.aborted === true);
    // Give the post-abort onComplete a chance to (wrongly) write.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const [threads, usage] = await Promise.all([
      prisma.thread.count({ where: { userId: subscriber.id } }),
      prisma.dailyUsage.count({ where: { userId: subscriber.id } }),
    ]);
    expect(threads).toBe(0);
    expect(usage).toBe(0);
  });
});
