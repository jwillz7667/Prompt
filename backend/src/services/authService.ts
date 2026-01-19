import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { generateTokenPair, verifyRefreshToken, type TokenPayload } from '../utils/jwt.js';

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
  // Verify the identity token with Apple
  const applePayload = await appleSignin.verifyIdToken(identityToken, {
    audience: process.env['APPLE_CLIENT_ID'],
    ignoreExpiration: false,
  });

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

export async function refreshTokens(refreshToken: string): Promise<AuthResult> {
  const decoded = verifyRefreshToken(refreshToken);

  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new Error('Invalid or expired session');
  }

  if (session.user.tokenVersion !== decoded.tokenVersion) {
    // Token version mismatch - user has been logged out
    await prisma.session.delete({ where: { id: session.id } });
    throw new Error('Session invalidated');
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

export async function logout(accessToken: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { accessToken },
  });
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
}
