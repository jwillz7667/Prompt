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

export async function authenticateWithApple(
  identityToken: string,
  authorizationCode: string,
  fullName?: { givenName?: string; familyName?: string },
  deviceInfo?: { deviceId?: string; deviceName?: string }
): Promise<AuthResult> {
  // Accept both iOS app ID and web Services ID
  const iosClientId = process.env['APPLE_CLIENT_ID'];
  const webClientId = process.env['APPLE_WEB_CLIENT_ID'];
  const audiences = [iosClientId, webClientId].filter(Boolean) as string[];

  authLogger.debug({ audiences }, 'Verifying Apple identity token');

  // Verify the identity token with Apple (accepts array of valid audiences)
  const applePayload = await appleSignin.verifyIdToken(identityToken, {
    audience: audiences,
    ignoreExpiration: false,
  });

  authLogger.debug({ appleId: applePayload.sub }, 'Apple token verified');
  const { sub: appleId, email } = applePayload;

  if (!email) {
    throw new Error('Email not provided by Apple');
  }

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { appleId },
  });

  if (!user) {
    // Check if email exists (user might have signed up differently)
    user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Link Apple ID to existing account
      user = await prisma.user.update({
        where: { id: user.id },
        data: { appleId },
      });
    } else {
      // Create new user
      const name = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
        : null;

      user = await prisma.user.create({
        data: {
          email,
          appleId,
          name,
          emailVerified: new Date(),
        },
      });

      // Send welcome email (fire-and-forget)
      sendWelcomeEmail(email, name).catch((err) => {
        authLogger.warn({ error: err, email }, 'Failed to send welcome email');
      });
    }
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const tokens = generateTokenPair({
    userId: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
  });

  // Create session
  await prisma.session.create({
    data: {
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceId: deviceInfo?.deviceId,
      deviceName: deviceInfo?.deviceName,
      deviceType: 'ios',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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
// GOOGLE OAUTH
// ============================================================================

export async function authenticateWithGoogle(
  idToken: string,
  deviceInfo?: { deviceId?: string; deviceName?: string }
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

  if (session.user.tokenVersion !== decoded.tokenVersion) {
    // Token version mismatch - user has been logged out
    await prisma.session.delete({ where: { id: session.id } });
    throw new RefreshTokenError('SESSION_REVOKED', 'Session invalidated');
  }

  const tokens = generateTokenPair({
    userId: session.user.id,
    email: session.user.email,
    tokenVersion: session.user.tokenVersion,
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
