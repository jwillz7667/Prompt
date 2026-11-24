import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { AppleTokenError } from '../../src/features/apple-account/apple-client.js';
import { AppleSiwaConfigError, loadAppleSiwaConfig } from '../../src/features/apple-account/config.js';
import { createAppleAccountService } from '../../src/features/apple-account/service.js';
import { openAppleTokenGrant, sealAppleTokenGrant } from '../../src/features/apple-account/token-cipher.js';

const privateKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
const encryptionKey = randomBytes(32);
const fullEnv = {
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_SIWA_KEY_ID: 'KEY1234567',
  APPLE_SIWA_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
  APPLE_SIWA_TOKEN_ENCRYPTION_KEY: encryptionKey.toString('base64'),
};
const config = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey, encryptionKey };
const NOW = new Date('2026-11-24T12:00:00Z');

describe('Sign in with Apple configuration', () => {
  it('is disabled when no credentials are set', () => {
    expect(loadAppleSiwaConfig({})).toBeUndefined();
  });

  it('rejects a partial configuration instead of running half-configured', () => {
    expect(() => loadAppleSiwaConfig({ APPLE_SIWA_KEY_ID: 'KEY1234567' })).toThrow(AppleSiwaConfigError);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(() =>
      loadAppleSiwaConfig({ ...fullEnv, APPLE_SIWA_TOKEN_ENCRYPTION_KEY: randomBytes(16).toString('base64') }),
    ).toThrow(AppleSiwaConfigError);
  });

  it('restores escaped newlines in the private key', () => {
    expect(loadAppleSiwaConfig(fullEnv)?.privateKey).toBe(privateKey);
  });
});

describe('Apple token sealing', () => {
  it('round-trips a grant without exposing the token in the sealed form', () => {
    const sealed = sealAppleTokenGrant({ clientId: 'com.app', refreshToken: 'secret-refresh' }, encryptionKey);

    expect(sealed).not.toContain('secret-refresh');
    expect(openAppleTokenGrant(sealed, encryptionKey)).toEqual({ clientId: 'com.app', refreshToken: 'secret-refresh' });
  });

  it('rejects a tampered or foreign-key token', () => {
    const sealed = sealAppleTokenGrant({ clientId: 'com.app', refreshToken: 'secret-refresh' }, encryptionKey);

    expect(() => openAppleTokenGrant(sealed, randomBytes(32))).toThrow();
    expect(() => openAppleTokenGrant(`${sealed.slice(0, -2)}AA`, encryptionKey)).toThrow();
  });
});

function fakeDb(sealedToken: string | null = null, pending: Array<Record<string, unknown>> = []) {
  return {
    user: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ appleRefreshToken: sealedToken }),
    },
    appleTokenRevocation: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(pending),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function buildService(db: ReturnType<typeof fakeDb>, client: { exchangeAuthorizationCode: ReturnType<typeof vi.fn>; revokeRefreshToken: ReturnType<typeof vi.fn> }) {
  return createAppleAccountService({
    config,
    client,
    db: db as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    now: () => NOW,
  });
}

describe('Apple account service', () => {
  it('stores the exchanged refresh token sealed on the user', async () => {
    const db = fakeDb();
    const client = { exchangeAuthorizationCode: vi.fn().mockResolvedValue('refresh-1'), revokeRefreshToken: vi.fn() };

    await buildService(db, client).rememberRefreshToken('user_1', 'code-1', 'com.app');

    const sealed = db.user.update.mock.calls[0]![0].data.appleRefreshToken as string;
    expect(openAppleTokenGrant(sealed, encryptionKey)).toEqual({ clientId: 'com.app', refreshToken: 'refresh-1' });
  });

  it('does not fail sign-in when the code exchange fails', async () => {
    const db = fakeDb();
    const client = {
      exchangeAuthorizationCode: vi.fn().mockRejectedValue(new AppleTokenError('exchange', 400, 'invalid_grant')),
      revokeRefreshToken: vi.fn(),
    };

    await expect(buildService(db, client).rememberRefreshToken('user_1', 'used-code', 'com.app')).resolves.toBeUndefined();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('queues a failed revoke for retry instead of blocking account deletion', async () => {
    const sealed = sealAppleTokenGrant({ clientId: 'com.app', refreshToken: 'refresh-1' }, encryptionKey);
    const db = fakeDb(sealed);
    const client = {
      exchangeAuthorizationCode: vi.fn(),
      revokeRefreshToken: vi.fn().mockRejectedValue(new AppleTokenError('revoke', 503, 'down')),
    };

    await buildService(db, client).revokeBeforeAccountDeletion('user_1');

    expect(db.appleTokenRevocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sealedGrant: sealed, attempts: 1 }),
    });
  });

  it('retries due revocations, deleting successes and rescheduling transient failures', async () => {
    const sealed = sealAppleTokenGrant({ clientId: 'com.app', refreshToken: 'refresh-1' }, encryptionKey);
    const db = fakeDb(null, [
      { id: 'ok', sealedGrant: sealed, attempts: 1 },
      { id: 'later', sealedGrant: sealed, attempts: 2 },
      { id: 'dead', sealedGrant: sealed, attempts: 1 },
    ]);
    const client = {
      exchangeAuthorizationCode: vi.fn(),
      revokeRefreshToken: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new AppleTokenError('revoke', 503, 'down'))
        .mockRejectedValueOnce(new AppleTokenError('revoke', 400, 'invalid_client')),
    };

    const outcome = await buildService(db, client).retryPendingRevocations();

    expect(outcome).toEqual({ revoked: 1, rescheduled: 1, abandoned: 1 });
    expect(db.appleTokenRevocation.update).toHaveBeenCalledWith({
      where: { id: 'later' },
      data: expect.objectContaining({ attempts: 3 }),
    });
  });
});
