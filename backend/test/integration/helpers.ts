import { randomBytes } from 'node:crypto';

import express, { type Express } from 'express';

import { prisma } from '../../src/utils/prisma.js';
import { generateTokenPair } from '../../src/utils/jwt.js';
import { promptRouter } from '../../src/routes/prompts.js';
import { templatesRouter } from '../../src/routes/templates.js';
import { sharedRouter } from '../../src/routes/shared.js';

export { prisma };

// Minimal app mirroring the index.ts mounts under test, without the network
// listeners, Socket.IO, or Redis/queue initialization the full app boots.
export function buildTestApp(): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v1/prompts', promptRouter);
  app.use('/api/v1/templates', templatesRouter);
  app.use('/api/v1/shared', sharedRouter);
  return app;
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

export async function createTestUser(
  overrides: { subscriptionTier?: 'FREE' | 'PRO' | 'PREMIUM' } = {}
): Promise<TestUser> {
  const email = `test-${randomBytes(8).toString('hex')}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Integration Test User',
      subscriptionTier: overrides.subscriptionTier ?? 'FREE',
    },
    select: { id: true, email: true, tokenVersion: true },
  });

  const { accessToken } = generateTokenPair({
    userId: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
  });

  return { id: user.id, email: user.email, accessToken };
}

export async function createTestPrompt(
  userId: string,
  overrides: Partial<{ title: string; originalPrompt: string; enhancedPrompt: string }> = {}
): Promise<{ id: string }> {
  return prisma.prompt.create({
    data: {
      userId,
      originalPrompt: overrides.originalPrompt ?? 'write a poem about the sea',
      enhancedPrompt:
        overrides.enhancedPrompt ??
        'Write a 12-line free-verse poem about the sea at dusk, using concrete sensory imagery.',
      title: overrides.title ?? 'Sea poem',
    },
    select: { id: true },
  });
}

// Deleting the user cascades to prompts, sessions, and shares.
export async function cleanupUser(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}
