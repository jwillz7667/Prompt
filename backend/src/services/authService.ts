import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { generateTokenPair, verifyRefreshToken, type TokenPayload } from '../utils/jwt.js';
import { authLogger } from '../utils/logger.js';
import { cache } from '../utils/redis.js';
import { sendWelcomeEmail } from './emailService.js';

const googleClient = new OAuth2Client(process.env['GOOGLE_CLIENT_ID']);

// Bound Apple's public-key/token requests. The library's default fetch has no
// timeout, which can leave an iOS sign-in waiting on an unavailable provider.
appleSignin._setFetch((url: string, options: RequestInit = {}) =>
  fetch(url, { ...options, signal: AbortSignal.timeout(10_000) }),
);

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    isPremium: boolean;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// APPLE SIGN IN
// ============================================================================

export class SignInError extends Error {
  constructor(
    readonly code:
      | 'IDENTITY_INVALID'
      | 'ACCOUNT_DISABLED'
      | 'ACCOUNT_LINK_REQUIRED'
      | 'AUTH_UNAVAILABLE',
    message: string,
    readonly statusCode: 401 | 409 | 503,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

export async function authenticateWithApple(
  identityToken: string,
  _authorizationCode: string,
  fullName?: { givenName?: string; familyName?: string },
  deviceInfo?: { deviceId?: string; deviceName?: string },
  expectedNonce?: string,
): Promise<AuthResult> {
  const audiences = [process.env['APPLE_CLIENT_ID'], process.env['APPLE_WEB_CLIENT_ID']]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (audiences.length === 0) {
    throw new SignInError(
      'AUTH_UNAVAILABLE',
      'Apple sign-in is temporarily unavailable. Please try again shortly.',
      503,
    );
  }
  // Decoding only rejects malformed input. Identity is trusted only after Apple's
  // signature, issuer, audience, expiry and current clients' nonce checks.
  if (!jwt.decode(identityToken)) {
    throw new SignInError(
      'IDENTITY_INVALID',
      'Apple sign-in could not be verified. Please try again.',
      401,
    );
  }
  let applePayload;
  try {
    applePayload = await appleSignin.verifyIdToken(identityToken, {
      audience: audiences,
      ignoreExpiration: false,
      ...(expectedNonce ? { nonce: expectedNonce } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const temporaryKeyFailure =
      /ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|fetch|socket|timeout|request to/i.test(message);
    if (error instanceof jwt.JsonWebTokenError && !temporaryKeyFailure) {
      throw new SignInError(
        'IDENTITY_INVALID',
        'Apple sign-in could not be verified. Please try again.',
        401,
      );
    }
    throw new SignInError(
      'AUTH_UNAVAILABLE',
      'Apple sign-in is temporarily unavailable. Please try again shortly.',
      503,
    );
  }
  const appleId = applePayload.sub;
  if (!appleId || (expectedNonce && applePayload.nonce !== expectedNonce)) {
    throw new SignInError(
      'IDENTITY_INVALID',
      'Apple sign-in could not be verified. Please try again.',
      401,
    );
  }
  const email = applePayload.email?.trim().toLowerCase();
  const emailVerified =
    applePayload.email_verified === true || applePayload.email_verified === 'true';

  const result = await prisma.$transaction(async (tx) => {
    // Repeated completions must find/create one user instead of racing a unique constraint.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`apple-auth:${appleId}`}, 0))`;
    let user = await tx.user.findUnique({ where: { appleId } });
    let created = false;
    if (!user) {
      if (!email || !emailVerified) {
        throw new SignInError(
          'IDENTITY_INVALID',
          'Apple did not provide a verified email for this account. Please try signing in again.',
          401,
        );
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-email:${email}`}, 0))`;
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing?.appleId && existing.appleId !== appleId) {
        throw new SignInError(
          'ACCOUNT_LINK_REQUIRED',
          'This email is already linked to a different Apple account. Please use the original account.',
          409,
        );
      }
      if (existing && !existing.isActive) {
        throw new SignInError(
          'ACCOUNT_DISABLED',
          'This account is unavailable. Please contact support.',
          401,
        );
      }
      const name = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim() || null
        : null;
      user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { appleId } })
        : await tx.user.create({ data: { email, appleId, name, emailVerified: new Date() } });
      created = !existing;
    }
    if (!user.isActive) {
      throw new SignInError(
        'ACCOUNT_DISABLED',
        'This account is unavailable. Please contact support.',
        401,
      );
    }
    // Apple's stable subject identifies returning users even when their response
    // no longer includes an email or full name.
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = generateTokenPair({
      userId: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    await tx.session.create({
      data: {
        id: tokens.sessionId,
        userId: user.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        deviceId: deviceInfo?.deviceId,
        deviceName: deviceInfo?.deviceName,
        deviceType: 'ios',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { user, tokens, created };
  });
  if (result.created) {
    void sendWelcomeEmail(result.user.email, result.user.name).catch((error) => {
      authLogger.warn({ err: error, userId: result.user.id }, 'Failed to send welcome email');
    });
  }
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      avatarUrl: result.user.avatarUrl,
      isPremium: result.user.isPremium,
    },
    ...result.tokens,
  };
}

// ============================================================================
// GOOGLE OAUTH
// ============================================================================

export async function authenticateWithGoogle(
  idToken: string,
  deviceInfo?: { deviceId?: string; deviceName?: string },
): Promise<AuthResult> {
  // Verify the ID token with Google
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env['GOOGLE_CLIENT_ID'],
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Invalid Google token');
  }

  const { sub: googleId, email, name, picture } = payload;

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { googleId },
  });

  if (!user) {
    user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl: picture || user.avatarUrl },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          name: name || null,
          avatarUrl: picture || null,
          emailVerified: new Date(),
        },
      });

      // Send welcome email (fire-and-forget)
      sendWelcomeEmail(email, name || null).catch((err) => {
        authLogger.warn({ error: err, email }, 'Failed to send welcome email');
      });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = generateTokenPair({
    userId: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
  });

  await prisma.session.create({
    data: {
      id: tokens.sessionId,
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceId: deviceInfo?.deviceId,
      deviceName: deviceInfo?.deviceName,
      deviceType: 'ios',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isPremium: user.isPremium,
    },
    ...tokens,
  };
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Token-level refresh failure: the refresh token itself is expired, invalid,
 * or its session was revoked. Anything else thrown by refreshTokens (Prisma,
 * Redis) is an infrastructure failure and must NOT be surfaced as 401 — the
 * iOS client clears its keychain session on 401/403, so converting a DB blip
 * into a 401 logs every active user out (the July 2026 incident amplifier).
 */
export class RefreshTokenError extends Error {
  constructor(
    readonly code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'SESSION_REVOKED',
    message: string,
  ) {
    super(message);
    this.name = 'RefreshTokenError';
  }
}

export async function refreshTokens(refreshToken: string): Promise<AuthResult> {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    // TokenExpiredError extends JsonWebTokenError, so it must be checked first.
    if (error instanceof jwt.TokenExpiredError) {
      throw new RefreshTokenError('TOKEN_EXPIRED', 'Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new RefreshTokenError('TOKEN_INVALID', 'Refresh token invalid');
    }
    throw error;
  }

  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session) {
    throw new RefreshTokenError('SESSION_REVOKED', 'Session not found');
  }

  if (session.expiresAt < new Date()) {
    throw new RefreshTokenError('TOKEN_EXPIRED', 'Session expired');
  }

  if (
    !session.user.isActive ||
    session.user.id !== decoded.userId ||
    session.user.tokenVersion !== decoded.tokenVersion
  ) {
    // Token version mismatch - user has been logged out
    await prisma.session.delete({ where: { id: session.id } });
    throw new RefreshTokenError('SESSION_REVOKED', 'Session invalidated');
  }

  const tokens = generateTokenPair({
    userId: session.user.id,
    email: session.user.email,
    tokenVersion: session.user.tokenVersion,
    sessionId: session.id,
  });

  // Update session with new tokens
  await prisma.session.update({
    where: { id: session.id },
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
      isPremium: session.user.isPremium,
    },
    ...tokens,
  };
}

// ============================================================================
// LOGOUT
// ============================================================================

export async function logout(accessToken: string, userId?: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { accessToken },
  });

  // Invalidate user cache if userId is provided
  if (userId) {
    await cache.invalidateUser(userId);
  }
}

export async function logoutAllDevices(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });

  // Increment token version to invalidate all refresh tokens
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });

  // Invalidate all user caches
  await cache.invalidateUser(userId);
  await cache.invalidateSubscription(userId);
}
