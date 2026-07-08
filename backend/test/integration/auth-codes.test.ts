import { afterAll, describe, expect, it } from 'vitest';
import express, { type Express, type Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { authenticate, type AuthenticatedRequest } from '../../src/middleware/auth.js';
import { createTestUser, cleanupUser, prisma, type TestUser } from './helpers.js';

// The middleware is exercised against the real database (users, tokenVersion)
// but through a minimal app so only auth behavior is under test.
function buildAuthApp(): Express {
  const app = express();
  app.get('/protected', authenticate, (req: AuthenticatedRequest, res: Response) => {
    res.json({ userId: req.user?.id ?? null });
  });
  return app;
}

const app = buildAuthApp();
const accessSecret = process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret';

const createdUsers: TestUser[] = [];

async function newUser(): Promise<TestUser> {
  const user = await createTestUser();
  createdUsers.push(user);
  return user;
}

afterAll(async () => {
  await Promise.all(createdUsers.map((user) => cleanupUser(user.id)));
});

describe('authenticate 401 error codes', () => {
  it('passes a valid token through without an error code', async () => {
    const user = await newUser();

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user.id);
  });

  it('returns TOKEN_MISSING when the authorization header is absent', async () => {
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing or invalid authorization header');
    expect(res.body.code).toBe('TOKEN_MISSING');
  });

  it('returns TOKEN_MISSING for a non-Bearer authorization scheme', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Basic abc123');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });

  it('returns TOKEN_EXPIRED for an expired token', async () => {
    const user = await newUser();
    const expiredToken = jwt.sign(
      { userId: user.id, email: user.email, sessionId: 'expired-session', tokenVersion: 0 },
      accessSecret,
      { expiresIn: -60 }
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expired');
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('returns TOKEN_INVALID for a malformed token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-jwt-at-all');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('returns TOKEN_INVALID for a token signed with the wrong secret', async () => {
    const user = await newUser();
    const forgedToken = jwt.sign(
      { userId: user.id, email: user.email, sessionId: 'forged-session', tokenVersion: 0 },
      'the-wrong-secret',
      { expiresIn: '15m' }
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('returns SESSION_REVOKED when tokenVersion was bumped after issuance', async () => {
    const user = await newUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token has been revoked');
    expect(res.body.code).toBe('SESSION_REVOKED');
  });

  it('returns SESSION_REVOKED when the user no longer exists', async () => {
    const user = await createTestUser();
    await cleanupUser(user.id);

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('User not found or inactive');
    expect(res.body.code).toBe('SESSION_REVOKED');
  });

  it('returns SESSION_REVOKED when the user is deactivated', async () => {
    const user = await newUser();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('User not found or inactive');
    expect(res.body.code).toBe('SESSION_REVOKED');
  });
});
