import type { PrismaClient } from '@prisma/client';

import { AppleTokenError, type AppleTokenClient } from './apple-client.js';
import type { AppleSiwaConfig } from './config.js';
import { openAppleTokenGrant, sealAppleTokenGrant } from './token-cipher.js';

export interface AppleAccountLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface AppleAccountDeps {
  /** Undefined while Sign in with Apple server credentials are not configured. */
  config: AppleSiwaConfig | undefined;
  client: AppleTokenClient | undefined;
  db: Pick<PrismaClient, 'user' | 'appleTokenRevocation'>;
  logger: AppleAccountLogger;
  now?: () => Date;
}

// ~2 weeks of exponential backoff capped at a day; after that a human is paged
// through the error log and the sealed token is dropped.
const MAX_REVOCATION_ATTEMPTS = 20;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
export const REVOCATION_SWEEP_BATCH_SIZE = 50;

function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** attempts, MAX_BACKOFF_MS);
}

function describeFailure(error: unknown): string {
  if (error instanceof AppleTokenError) return `${error.operation}:${error.status ?? 'network'}`;
  return error instanceof Error ? error.name : 'unknown';
}

export function createAppleAccountService(deps: AppleAccountDeps) {
  const { db, logger } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    get isEnabled(): boolean {
      return deps.config !== undefined && deps.client !== undefined;
    },

    /**
     * Exchanges the one-time authorization code from a Sign in with Apple
     * login for a refresh token and stores it sealed on the user, so it can
     * be revoked when the account is deleted. Never throws: sign-in must not
     * fail because Apple's token endpoint is slow or the code was reused.
     */
    async rememberRefreshToken(
      userId: string,
      authorizationCode: string,
      clientId: string,
    ): Promise<void> {
      const { config, client } = deps;
      if (!config || !client || authorizationCode.trim().length === 0) return;
      try {
        const refreshToken = await client.exchangeAuthorizationCode(authorizationCode, clientId);
        await db.user.update({
          where: { id: userId },
          data: {
            appleRefreshToken: sealAppleTokenGrant(
              { clientId, refreshToken },
              config.encryptionKey,
            ),
          },
        });
      } catch (error) {
        logger.warn(
          { userId, reason: describeFailure(error) },
          'Could not store the Sign in with Apple refresh token',
        );
      }
    },

    /**
     * Revokes the user's Sign in with Apple token before the account row is
     * deleted. A failed revoke is queued for retry instead of blocking the
     * deletion, which must always succeed for the user.
     */
    async revokeBeforeAccountDeletion(userId: string): Promise<void> {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { appleRefreshToken: true },
      });
      const sealed = user?.appleRefreshToken;
      if (!sealed) return;
      const { config, client } = deps;
      if (!config || !client) {
        logger.error(
          { userId },
          'Cannot revoke Sign in with Apple token: SIWA credentials are not configured',
        );
        return;
      }
      try {
        const grant = openAppleTokenGrant(sealed, config.encryptionKey);
        await client.revokeRefreshToken(grant.refreshToken, grant.clientId);
        logger.info({ userId }, 'Revoked Sign in with Apple token for deleted account');
      } catch (error) {
        logger.warn(
          { userId, reason: describeFailure(error) },
          'Sign in with Apple revoke failed; queued for retry',
        );
        await db.appleTokenRevocation.create({
          data: {
            sealedGrant: sealed,
            attempts: 1,
            nextAttemptAt: new Date(now().getTime() + backoffMs(1)),
            lastError: describeFailure(error),
          },
        });
      }
    },

    /** Retries queued revocations that are due; bounded per run. */
    async retryPendingRevocations(
      limit: number = REVOCATION_SWEEP_BATCH_SIZE,
    ): Promise<{ revoked: number; rescheduled: number; abandoned: number }> {
      const { config, client } = deps;
      const outcome = { revoked: 0, rescheduled: 0, abandoned: 0 };
      if (!config || !client) return outcome;
      const due = await db.appleTokenRevocation.findMany({
        where: { nextAttemptAt: { lte: now() } },
        orderBy: { nextAttemptAt: 'asc' },
        take: limit,
      });
      // Sequential on purpose: a small batch against one Apple endpoint.
      for (const row of due) {
        try {
          const grant = openAppleTokenGrant(row.sealedGrant, config.encryptionKey);
          await client.revokeRefreshToken(grant.refreshToken, grant.clientId);
          await db.appleTokenRevocation.delete({ where: { id: row.id } });
          outcome.revoked += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          const isRetryable = !(error instanceof AppleTokenError) || error.isRetryable;
          if (!isRetryable || attempts >= MAX_REVOCATION_ATTEMPTS) {
            logger.error(
              { revocationId: row.id, attempts, reason: describeFailure(error) },
              'Giving up on a Sign in with Apple token revocation',
            );
            await db.appleTokenRevocation.delete({ where: { id: row.id } });
            outcome.abandoned += 1;
            continue;
          }
          await db.appleTokenRevocation.update({
            where: { id: row.id },
            data: {
              attempts,
              nextAttemptAt: new Date(now().getTime() + backoffMs(attempts)),
              lastError: describeFailure(error),
            },
          });
          outcome.rescheduled += 1;
        }
      }
      return outcome;
    },
  };
}

export type AppleAccountService = ReturnType<typeof createAppleAccountService>;
