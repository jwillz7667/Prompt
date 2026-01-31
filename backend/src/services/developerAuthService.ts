/**
 * Developer Authentication Service
 * Handles email/password auth for developer accounts (separate from app users)
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt.js';
import { authLogger } from '../utils/logger.js';
import { sendEmail } from './emailService.js';

export interface DeveloperAuthResult {
  developer: {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    isVerified: boolean;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// DEVELOPER SIGNUP
// ============================================================================

export async function registerDeveloper(
  email: string,
  password: string,
  name?: string,
  company?: string
): Promise<DeveloperAuthResult> {
  // Check if email already exists
  const existing = await prisma.developer.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    throw new Error('Email already registered');
  }

  // Validate password strength
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create developer account
  const developer = await prisma.developer.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name: name || null,
      company: company || null,
      // Create free API subscription
      apiSubscription: {
        create: {
          tier: 'API_FREE',
          status: 'ACTIVE',
          includedRequests: 100,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      },
    },
  });

  authLogger.info({ developerId: developer.id, email: developer.email }, 'Developer registered');

  // Send welcome email
  sendEmail({
    to: email,
    subject: 'Welcome to Promptomize Developer Platform',
    html: `
      <h1>Welcome to the Promptomize API!</h1>
      <p>Hi ${name || 'Developer'},</p>
      <p>Your developer account has been created. You can now:</p>
      <ul>
        <li>Create API keys to access the Promptomize enhancement API</li>
        <li>Monitor your usage and billing</li>
        <li>Test the API in our playground</li>
      </ul>
      <p>Visit the <a href="https://promptomize.app/developers">Developer Portal</a> to get started.</p>
      <p>You start with 100 free API requests per month.</p>
    `,
  }).catch((err) => {
    authLogger.warn({ error: err, email }, 'Failed to send developer welcome email');
  });

  // Generate tokens
  const tokens = generateTokenPair({
    userId: developer.id,
    email: developer.email,
    tokenVersion: developer.tokenVersion,
    isDeveloper: true,
  });

  return {
    developer: {
      id: developer.id,
      email: developer.email,
      name: developer.name,
      company: developer.company,
      isVerified: developer.isVerified,
    },
    ...tokens,
  };
}

// ============================================================================
// DEVELOPER LOGIN
// ============================================================================

export async function loginDeveloper(
  email: string,
  password: string
): Promise<DeveloperAuthResult> {
  const developer = await prisma.developer.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!developer) {
    throw new Error('Invalid email or password');
  }

  if (!developer.isActive) {
    throw new Error('Account has been deactivated');
  }

  // Verify password
  const isValid = await bcrypt.compare(password, developer.passwordHash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  // Update last login
  await prisma.developer.update({
    where: { id: developer.id },
    data: { lastLoginAt: new Date() },
  });

  authLogger.info({ developerId: developer.id }, 'Developer logged in');

  // Generate tokens
  const tokens = generateTokenPair({
    userId: developer.id,
    email: developer.email,
    tokenVersion: developer.tokenVersion,
    isDeveloper: true,
  });

  // Store refresh token
  await prisma.developer.update({
    where: { id: developer.id },
    data: { refreshToken: tokens.refreshToken },
  });

  return {
    developer: {
      id: developer.id,
      email: developer.email,
      name: developer.name,
      company: developer.company,
      isVerified: developer.isVerified,
    },
    ...tokens,
  };
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

export async function refreshDeveloperTokens(refreshToken: string): Promise<DeveloperAuthResult> {
  const decoded = verifyRefreshToken(refreshToken);

  if (!decoded.isDeveloper) {
    throw new Error('Not a developer token');
  }

  const developer = await prisma.developer.findUnique({
    where: { id: decoded.userId },
  });

  if (!developer) {
    throw new Error('Developer not found');
  }

  if (developer.refreshToken !== refreshToken) {
    throw new Error('Invalid refresh token');
  }

  if (developer.tokenVersion !== decoded.tokenVersion) {
    throw new Error('Token has been revoked');
  }

  if (!developer.isActive) {
    throw new Error('Account has been deactivated');
  }

  // Generate new tokens
  const tokens = generateTokenPair({
    userId: developer.id,
    email: developer.email,
    tokenVersion: developer.tokenVersion,
    isDeveloper: true,
  });

  // Update refresh token
  await prisma.developer.update({
    where: { id: developer.id },
    data: { refreshToken: tokens.refreshToken },
  });

  return {
    developer: {
      id: developer.id,
      email: developer.email,
      name: developer.name,
      company: developer.company,
      isVerified: developer.isVerified,
    },
    ...tokens,
  };
}

// ============================================================================
// LOGOUT
// ============================================================================

export async function logoutDeveloper(developerId: string): Promise<void> {
  await prisma.developer.update({
    where: { id: developerId },
    data: { refreshToken: null },
  });

  authLogger.info({ developerId }, 'Developer logged out');
}

// ============================================================================
// GET DEVELOPER BY ID
// ============================================================================

export async function getDeveloperById(developerId: string) {
  return prisma.developer.findUnique({
    where: { id: developerId },
    include: {
      apiSubscription: true,
    },
  });
}

// ============================================================================
// UPDATE DEVELOPER PROFILE
// ============================================================================

export async function updateDeveloperProfile(
  developerId: string,
  data: { name?: string; company?: string; website?: string }
) {
  return prisma.developer.update({
    where: { id: developerId },
    data,
  });
}

// ============================================================================
// CHANGE PASSWORD
// ============================================================================

export async function changeDeveloperPassword(
  developerId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
  });

  if (!developer) {
    throw new Error('Developer not found');
  }

  const isValid = await bcrypt.compare(currentPassword, developer.passwordHash);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password and increment token version to invalidate all sessions
  await prisma.developer.update({
    where: { id: developerId },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 },
      refreshToken: null,
    },
  });

  authLogger.info({ developerId }, 'Developer password changed');
}
