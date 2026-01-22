import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  authenticateWithApple,
  authenticateWithGoogle,
  refreshTokens,
  logout,
  logoutAllDevices,
} from '../services/authService.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';

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

    console.log('[Apple Auth] Received request, verifying token...');
    console.log('[Apple Auth] APPLE_CLIENT_ID configured:', !!process.env['APPLE_CLIENT_ID']);

    const result = await authenticateWithApple(
      data.identityToken,
      data.authorizationCode,
      data.fullName,
      { deviceId: data.deviceId, deviceName: data.deviceName }
    );

    console.log('[Apple Auth] Success for user:', result.user.email);
    res.json(result);
  } catch (error) {
    console.error('[Apple Auth] Error:', error);
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

    res.json(result);
  } catch (error) {
    console.error('Google auth error:', error);
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
    console.error('Refresh error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data' });
      return;
    }
    res.status(401).json({ error: 'Token refresh failed' });
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
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
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
    res.json({ success: true });
  } catch (error) {
    console.error('Logout all error:', error);
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
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});
