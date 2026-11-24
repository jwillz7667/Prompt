import { generateKeyPairSync, randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import appleSignin from 'apple-signin-auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/utils/prisma.js';
import { authRouter } from '../../src/routes/auth.js';
import { subscriptionRouter } from '../../src/routes/subscriptions.js';
import { threadRouter } from '../../src/routes/threads.js';
import { cache } from '../../src/utils/redis.js';

vi.mock('../../src/services/emailService.js', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
}));

let server: Server;
const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/subscriptions', subscriptionRouter);
app.use('/threads', threadRouter);

const clientID = 'com.res.promptomizer';
const nonce = 'a'.repeat(64);
const fixturePrefix = `ios-auth-${randomUUID()}`;
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJWK = keyPair.publicKey.export({ format: 'jwk' });
const keyFetch = vi.fn(
  async () =>
    new Response(
      JSON.stringify({
        keys: [{ ...publicJWK, kid: 'ios-auth-regression', alg: 'RS256', use: 'sig' }],
      }),
    ),
);

function identity(claims: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    {
      sub: `${fixturePrefix}-user`,
      email: `${fixturePrefix}@example.test`,
      email_verified: true,
      nonce,
      ...claims,
    },
    keyPair.privateKey,
    {
      algorithm: 'RS256',
      keyid: 'ios-auth-regression',
      audience: clientID,
      issuer: 'https://appleid.apple.com',
      expiresIn: '5m',
      ...options,
    },
  );
}
function signIn(identityToken = identity(), expectedNonce: string | null = nonce) {
  return request(server)
    .post('/auth/apple')
    .send({
      identityToken,
      authorizationCode: 'local-test-authorization-code',
      nonce: expectedNonce ?? undefined,
      fullName: { givenName: 'iOS', familyName: 'Regression' },
      deviceId: 'simulator-device',
      deviceName: 'iPhone Simulator',
    });
}

beforeAll(() => {
  server = app.listen(0);
  process.env['APPLE_CLIENT_ID'] = clientID;
  appleSignin._setFetch(keyFetch);
});
beforeEach(() => {
  vi.restoreAllMocks();
  appleSignin._setFetch(keyFetch);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.user.deleteMany({ where: { email: { startsWith: fixturePrefix } } });
});

describe('iOS Apple identity and session lifecycle', () => {
  it('verifies a signed identity, loads profile/subscription/threads, refreshes, and revokes on logout', async () => {
    const login = await signIn();
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      expiresIn: 900,
      user: { email: `${fixturePrefix}@example.test`, name: 'iOS Regression' },
    });
    const { accessToken, refreshToken } = login.body;
    const claims = jwt.decode(accessToken) as jwt.JwtPayload;
    const session = await prisma.session.findUnique({ where: { refreshToken } });
    expect(session?.id).toBe(claims['sessionId']);
    expect(session?.deviceId).toBe('simulator-device');
    const profile = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.user.id).toBe(login.body.user.id);
    expect(
      (
        await request(server)
          .get('/subscriptions/status')
          .set('Authorization', `Bearer ${accessToken}`)
      ).status,
    ).toBe(200);
    expect(
      (await request(server).get('/threads').set('Authorization', `Bearer ${accessToken}`)).status,
    ).toBe(200);
    const refreshed = await request(server).post('/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);
    expect((jwt.decode(refreshed.body.accessToken) as jwt.JwtPayload)['sessionId']).toBe(
      session?.id,
    );
    expect((await request(server).post('/auth/refresh').send({ refreshToken })).status).toBe(401);
    expect(
      (
        await request(server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server)
          .post('/auth/logout')
          .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      ).status,
    ).toBe(200);
    expect(
      (await request(server).post('/auth/refresh').send({ refreshToken: refreshed.body.refreshToken }))
        .status,
    ).toBe(401);
  });
  it('signs an existing Apple subject back in when Apple no longer sends email/name', async () => {
    const login = await signIn();
    const again = await signIn(identity({ email: undefined, email_verified: undefined }));
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(login.body.user.id);
  });
  it('accepts legacy clients without nonce while enforcing nonce for current iOS', async () => {
    expect((await signIn(identity({ nonce: undefined }), null)).status).toBe(200);
    const failed = await signIn(identity({ nonce: 'b'.repeat(64) }));
    expect(failed.status).toBe(401);
    expect(failed.body.code).toBe('IDENTITY_INVALID');
  });
  it('rejects forged signatures, wrong app audience, and expired identities', async () => {
    const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forged = jwt.sign(
      { sub: 'attacker', email: 'attacker@example.test', nonce },
      otherKey.privateKey,
      {
        algorithm: 'RS256',
        keyid: 'ios-auth-regression',
        audience: clientID,
        issuer: 'https://appleid.apple.com',
      },
    );
    for (const token of [
      forged,
      identity({}, { audience: 'different.app' }),
      identity({}, { expiresIn: -1 }),
    ]) {
      const result = await signIn(token);
      expect(result.status).toBe(401);
      expect(result.body.code).toBe('IDENTITY_INVALID');
    }
  });
  it('requires a verified email for a new subject and preserves existing account links', async () => {
    expect(
      (
        await signIn(
          identity({
            sub: `${fixturePrefix}-unverified`,
            email: `${fixturePrefix}-unverified@example.test`,
            email_verified: false,
          }),
        )
      ).status,
    ).toBe(401);
    const login = await signIn();
    const conflict = await signIn(identity({ sub: `${fixturePrefix}-other` }));
    expect(conflict.status).toBe(409);
    expect((await prisma.user.findUnique({ where: { id: login.body.user.id } }))?.appleId).toBe(
      `${fixturePrefix}-user`,
    );
  });
  it('returns 503 for database failures instead of telling iOS its identity is invalid', async () => {
    vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      new Error('Database temporarily unavailable'),
    );
    const failed = await signIn();
    expect(failed.status).toBe(503);
    expect(failed.body.code).toBe('AUTH_UNAVAILABLE');
    expect(failed.body.error).not.toContain('Database');
  });
  it('keeps existing profile requests retryable during database outages', async () => {
    const login = await signIn();
    vi.spyOn(cache, 'getUser').mockResolvedValue(null);
    vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Database unavailable'));
    const failed = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(failed.status).toBe(503);
    expect(failed.body.code).toBe('AUTH_UNAVAILABLE');
  });
  it('handles concurrent first sign-ins without creating duplicate users', async () => {
    const sub = `${fixturePrefix}-race`;
    const token = identity({ sub, email: `${fixturePrefix}-race@example.test` });
    const results = await Promise.all([signIn(token), signIn(token)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results[0].body.user.id).toBe(results[1].body.user.id);
    expect(await prisma.user.count({ where: { appleId: sub } })).toBe(1);
  });
  it('rejects deactivated accounts during sign-in and refresh', async () => {
    const login = await signIn(
      identity({
        sub: `${fixturePrefix}-disabled`,
        email: `${fixturePrefix}-disabled@example.test`,
      }),
    );
    expect(login.status).toBe(200);
    await prisma.user.update({ where: { id: login.body.user.id }, data: { isActive: false } });
    expect((await signIn(identity({ sub: `${fixturePrefix}-disabled` }))).status).toBe(401);
    expect(
      (await request(server).post('/auth/refresh').send({ refreshToken: login.body.refreshToken }))
        .status,
    ).toBe(401);
  });
});
