import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  authenticateWithApple,
  authenticateWithGoogle,
  refreshTokens,
  RefreshTokenError,
  logout,
  logoutAllDevices,
} from '../services/authService.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { authLogger } from '../utils/logger.js';

export const authRouter = Router();

// Validation schemas
const appleAuthSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1),
  fullName: z
    .object({
      givenName: z.string().optional(),
      familyName: z.string().optional(),
    })
    .optional(),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================================
// APPLE SIGN IN
// ============================================================================

authRouter.post('/apple', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = appleAuthSchema.parse(req.body);

    authLogger.debug({ appleClientConfigured: !!process.env['APPLE_CLIENT_ID'] }, 'Apple auth request received');

    const result = await authenticateWithApple(
      data.identityToken,
      data.authorizationCode,
      data.fullName,
      { deviceId: data.deviceId, deviceName: data.deviceName }
    );

    authLogger.info({ userId: result.user.id }, 'Apple auth successful');
    res.json(result);
  } catch (error) {
    authLogger.error({ err: error }, 'Apple auth failed');
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : 'Authentication failed';
    res.status(401).json({ error: message });
  }
});

// ============================================================================
// GOOGLE OAUTH
// ============================================================================

authRouter.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = googleAuthSchema.parse(req.body);

    const result = await authenticateWithGoogle(data.idToken, {
      deviceId: data.deviceId,
      deviceName: data.deviceName,
    });

    authLogger.info({ userId: result.user.id }, 'Google auth successful');
    res.json(result);
  } catch (error) {
    authLogger.error({ err: error }, 'Google auth failed');
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// ============================================================================
// TOKEN REFRESH
// ============================================================================

authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = refreshSchema.parse(req.body);
    const result = await refreshTokens(data.refreshToken);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      authLogger.warn({ err: error }, 'Token refresh failed');
      res.status(400).json({ error: 'Invalid request data' });
      return;
    }
    if (error instanceof RefreshTokenError) {
      authLogger.warn({ code: error.code, err: error }, 'Token refresh failed');
      res.status(401).json({ error: 'Token refresh failed', code: error.code });
      return;
    }
    // Infrastructure failure (DB/Redis), not a bad token. 401 here would make
    // clients discard their session over a transient outage, so return 503 and
    // let them retry with the same refresh token.
    authLogger.error({ err: error }, 'Token refresh infrastructure failure');
    res.status(503).json({ error: 'Temporarily unavailable, retry', code: 'RETRY_LATER' });
  }
});

// ============================================================================
// LOGOUT
// ============================================================================

authRouter.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      await logout(authHeader.substring(7));
    }
    authLogger.debug({ userId: req.user?.id }, 'User logged out');
    res.json({ success: true });
  } catch (error) {
    authLogger.error({ err: error }, 'Logout failed');
    res.status(500).json({ error: 'Logout failed' });
  }
});

authRouter.post('/logout-all', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await logoutAllDevices(req.user.id);
    authLogger.info({ userId: req.user.id }, 'User logged out from all devices');
    res.json({ success: true });
  } catch (error) {
    authLogger.error({ err: error }, 'Logout all devices failed');
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ============================================================================
// SESSION INFO
// ============================================================================

authRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { prisma } = await import('../utils/prisma.js');
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isPremium: true,
        premiumUntil: true,
        promptCount: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    authLogger.error({ err: error, userId: req.user?.id }, 'Failed to get user info');
    res.status(500).json({ error: 'Failed to get user info' });
  }
});
