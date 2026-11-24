import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { encryptionKey } = vi.hoisted(() => {
  // Must be in place before the apple-account module reads the environment.
  const { generateKeyPairSync: generate, randomBytes: random } = require('node:crypto') as typeof import('node:crypto');
  const key = random(32);
  process.env['APPLE_TEAM_ID'] = 'TEAM123456';
  process.env['APPLE_SIWA_KEY_ID'] = 'KEY1234567';
  process.env['APPLE_SIWA_PRIVATE_KEY'] = generate('ec', { namedCurve: 'P-256' })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
  process.env['APPLE_SIWA_TOKEN_ENCRYPTION_KEY'] = key.toString('base64');
  return { encryptionKey: key };
});

import { APPLE_REVOKE_ENDPOINT, appleAccountService, sealAppleTokenGrant } from '../../src/features/apple-account/index.js';
import { authenticate } from '../../src/middleware/auth.js';
import { userRouter } from '../../src/routes/users.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

const app = express().use(express.json()).use('/api/v1/users', authenticate, userRouter);
const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
const created: TestUser[] = [];

async function userWithAppleToken(): Promise<TestUser> {
  const user = await createTestUser();
  created.push(user);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      appleRefreshToken: sealAppleTokenGrant({ clientId: 'com.res.promptomizer', refreshToken: `rt-${user.id}` }, encryptionKey),
    },
  });
  return user;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await Promise.all(created.map((user) => cleanupUser(user.id)));
  await prisma.appleTokenRevocation.deleteMany({});
});

describe('account deletion and Sign in with Apple', () => {
  it('revokes the stored Apple refresh token with a signed client secret, then deletes the account', async () => {
    const user = await userWithAppleToken();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await request(app).delete('/api/v1/users/account').set('Authorization', `Bearer ${user.accessToken}`).expect(200);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(APPLE_REVOKE_ENDPOINT);
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('token')).toBe(`rt-${user.id}`);
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('client_id')).toBe('com.res.promptomizer');
    expect(jwt.decode(form.get('client_secret') ?? '', { complete: true })?.header).toMatchObject({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('still deletes the account and queues the revoke when Apple is unavailable', async () => {
    const user = await userWithAppleToken();
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));

    await request(app).delete('/api/v1/users/account').set('Authorization', `Bearer ${user.accessToken}`).expect(200);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    const queued = await prisma.appleTokenRevocation.findMany({});
    expect(queued).toHaveLength(1);
    expect(queued[0]?.sealedGrant).not.toContain(`rt-${user.id}`);

    await prisma.appleTokenRevocation.updateMany({ data: { nextAttemptAt: new Date(0) } });
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    expect(await appleAccountService.retryPendingRevocations()).toEqual({ revoked: 1, rescheduled: 0, abandoned: 0 });
    expect(await prisma.appleTokenRevocation.count()).toBe(0);
  });
});
