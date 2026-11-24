import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { promptRouter } from '../../src/routes/prompts.js';
import { userRouter } from '../../src/routes/users.js';
import { authRouter } from '../../src/routes/auth.js';
import { buildChatRouter, loadChatConfig } from '../../src/features/chat/index.js';
import { SUBSCRIPTION_REQUIRED_BODY } from '../../src/middleware/requireEntitlement.js';
import { aiConsentRequiredBody } from '../../src/middleware/requireAiConsent.js';
import {
  aiConsentConfig,
  parseAiConsentConfig,
} from '../../src/services/aiConsentService.js';
import { refreshTokens } from '../../src/services/authService.js';
import { generateTokenPair } from '../../src/utils/jwt.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

function buildApp(): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v1/prompts', promptRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/chat', buildChatRouter({ config: loadChatConfig({}) }));
  return app;
}

const app = buildApp();
const users: TestUser[] = [];
const initialConfig = { ...aiConsentConfig };

async function subscriber(): Promise<TestUser> {
  const user = await createTestUser({ subscriptionTier: 'PREMIUM' });
  users.push(user);
  await prisma.subscription.create({
    data: {
      userId: user.id,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  return user;
}

async function freeUser(): Promise<TestUser> {
  const user = await createTestUser();
  users.push(user);
  return user;
}

// An empty prompt fails body validation (400) once past both gates, so passing
// them is observable without calling a provider.
function postInvalidEnhance(user: TestUser) {
  return request(app)
    .post('/api/v1/prompts/enhance')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ prompt: '' });
}

function grant(user: TestUser, version: number) {
  return request(app)
    .post('/api/v1/users/me/ai-consent')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ version });
}

function withdraw(user: TestUser) {
  return request(app)
    .delete('/api/v1/users/me/ai-consent')
    .set('Authorization', `Bearer ${user.accessToken}`);
}

beforeAll(() => {
  aiConsentConfig.isEnforced = true;
  aiConsentConfig.currentVersion = 1;
});

afterEach(() => {
  aiConsentConfig.isEnforced = true;
  aiConsentConfig.currentVersion = 1;
});

afterAll(async () => {
  Object.assign(aiConsentConfig, initialConfig);
  for (const user of users) await cleanupUser(user.id);
});

describe('AI consent configuration', () => {
  it('is not enforced and requires version 1 when the env is unset', () => {
    expect(parseAiConsentConfig({})).toEqual({ isEnforced: false, currentVersion: 1 });
  });

  it('reads the enforcement flag and version from the env', () => {
    expect(
      parseAiConsentConfig({ AI_CONSENT_ENFORCED: 'true', AI_DATA_CONSENT_VERSION: '3' }),
    ).toEqual({ isEnforced: true, currentVersion: 3 });
  });

  it('fails boot on a non-positive version', () => {
    expect(() => parseAiConsentConfig({ AI_DATA_CONSENT_VERSION: '0' })).toThrow();
  });
});

describe('AI consent gate', () => {
  it('returns 403 AI_CONSENT_REQUIRED to a subscriber without consent when enforced', async () => {
    const user = await subscriber();

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(aiConsentRequiredBody(1));
  });

  it('lets a subscriber without consent through when enforcement is off', async () => {
    const user = await subscriber();
    aiConsentConfig.isEnforced = false;

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(400);
  });

  it('lets a subscriber with current consent through', async () => {
    const user = await subscriber();
    await grant(user, 1);

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(400);
  });

  it('re-requires consent after the disclosure version is bumped', async () => {
    const user = await subscriber();
    await grant(user, 1);
    aiConsentConfig.currentVersion = 2;

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(aiConsentRequiredBody(2));
  });

  it('returns the paywall 403 before the consent 403 to a user with neither', async () => {
    const user = await freeUser();

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(SUBSCRIPTION_REQUIRED_BODY);
  });

  it('rejects a chat message stream as JSON before any SSE starts', async () => {
    const user = await subscriber();

    const response = await request(app)
      .post(`/api/v1/chat/conversations/${randomUUID()}/messages/stream`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ content: 'hello' });

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual(aiConsentRequiredBody(1));
  });

  it('blocks AI again after consent is withdrawn', async () => {
    const user = await subscriber();
    await grant(user, 1);
    await withdraw(user);

    const response = await postInvalidEnhance(user);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('AI_CONSENT_REQUIRED');
  });
});

describe('POST /api/v1/users/me/ai-consent', () => {
  it('records consent and returns it with the required version', async () => {
    const user = await freeUser();

    const response = await grant(user, 1);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      aiDataConsent: { version: 1, grantedAt: expect.any(String) },
      requiredVersion: 1,
    });
  });

  it('keeps the original grant when the same version is posted again', async () => {
    const user = await freeUser();
    const first = await grant(user, 1);

    const second = await grant(user, 1);

    expect(second.status).toBe(200);
    expect(second.body.aiDataConsent).toEqual(first.body.aiDataConsent);
  });

  it('replaces an older grant with a newer version', async () => {
    const user = await freeUser();
    await grant(user, 1);
    aiConsentConfig.currentVersion = 2;

    const response = await grant(user, 2);

    expect(response.body.aiDataConsent.version).toBe(2);
  });

  it('returns 400 for a version newer than the current disclosure', async () => {
    const user = await freeUser();

    const response = await grant(user, 2);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('AI_CONSENT_VERSION_UNKNOWN');
  });

  it('returns 400 for a missing version', async () => {
    const user = await freeUser();

    const response = await request(app)
      .post('/api/v1/users/me/ai-consent')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({});

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/v1/users/me/ai-consent', () => {
  it('withdraws consent', async () => {
    const user = await freeUser();
    await grant(user, 1);

    const response = await withdraw(user);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ aiDataConsent: null, requiredVersion: 1 });
  });
});

describe('user payloads', () => {
  it('includes the consent in GET /users/me', async () => {
    const user = await freeUser();
    await grant(user, 1);

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(response.body.user.aiDataConsent).toEqual({
      version: 1,
      grantedAt: expect.any(String),
    });
  });

  it('includes null consent in GET /users/me for a user who never consented', async () => {
    const user = await freeUser();

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(response.body.user.aiDataConsent).toBeNull();
  });

  it('includes the consent in GET /auth/me, the payload iOS restores its session from', async () => {
    const user = await freeUser();
    await grant(user, 1);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(response.body.user.aiDataConsent).toEqual({
      version: 1,
      grantedAt: expect.any(String),
    });
  });

  it('includes the consent in the auth payload returned by a token refresh', async () => {
    const user = await freeUser();
    await grant(user, 1);
    const tokens = generateTokenPair({ userId: user.id, email: user.email, tokenVersion: 0 });
    await prisma.session.create({
      data: {
        id: tokens.sessionId,
        userId: user.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const result = await refreshTokens(tokens.refreshToken);

    expect(result.user.aiDataConsent).toEqual({ version: 1, grantedAt: expect.any(String) });
  });
});
