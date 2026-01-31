/**
 * Developer Authentication Routes
 * Handles signup, login, and token refresh for developer accounts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  registerDeveloper,
  loginDeveloper,
  refreshDeveloperTokens,
  logoutDeveloper,
  getDeveloperById,
  updateDeveloperProfile,
  changeDeveloperPassword,
} from '../services/developerAuthService.js';
import { authenticateDeveloper, type DeveloperAuthenticatedRequest } from '../middleware/developerAuth.js';
import { logger } from '../utils/logger.js';

export const developerAuthRouter = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100).optional(),
  company: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  company: z.string().max(100).optional(),
  website: z.string().url().max(200).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// ============================================================================
// SIGNUP
// ============================================================================

developerAuthRouter.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = signupSchema.parse(req.body);

    const result = await registerDeveloper(
      data.email,
      data.password,
      data.name,
      data.company
    );

    res.status(201).json({
      developer: result.developer,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    if (error instanceof Error) {
      if (error.message === 'Email already registered') {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error({ error }, 'Developer signup error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ============================================================================
// LOGIN
// ============================================================================

developerAuthRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const result = await loginDeveloper(data.email, data.password);

    res.json({
      developer: result.developer,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    if (error instanceof Error) {
      if (
        error.message === 'Invalid email or password' ||
        error.message === 'Account has been deactivated'
      ) {
        res.status(401).json({ error: error.message });
        return;
      }
    }
    logger.error({ error }, 'Developer login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================================================
// REFRESH TOKEN
// ============================================================================

developerAuthRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = refreshSchema.parse(req.body);

    const result = await refreshDeveloperTokens(data.refreshToken);

    res.json({
      developer: result.developer,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    if (error instanceof Error) {
      res.status(401).json({ error: error.message });
      return;
    }
    logger.error({ error }, 'Developer token refresh error');
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ============================================================================
// LOGOUT
// ============================================================================

developerAuthRouter.post(
  '/logout',
  authenticateDeveloper,
  async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.developer) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      await logoutDeveloper(req.developer.id);

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      logger.error({ error }, 'Developer logout error');
      res.status(500).json({ error: 'Logout failed' });
    }
  }
);

// ============================================================================
// GET CURRENT DEVELOPER (ME)
// ============================================================================

developerAuthRouter.get(
  '/me',
  authenticateDeveloper,
  async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.developer) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const developer = await getDeveloperById(req.developer.id);

      if (!developer) {
        res.status(404).json({ error: 'Developer not found' });
        return;
      }

      res.json({
        developer: {
          id: developer.id,
          email: developer.email,
          name: developer.name,
          company: developer.company,
          website: developer.website,
          isVerified: developer.isVerified,
          totalApiCalls: developer.totalApiCalls.toString(),
          createdAt: developer.createdAt,
          lastLoginAt: developer.lastLoginAt,
        },
        subscription: developer.apiSubscription
          ? {
              tier: developer.apiSubscription.tier,
              status: developer.apiSubscription.status,
              includedRequests: developer.apiSubscription.includedRequests,
              currentPeriodUsage: developer.apiSubscription.currentPeriodUsage,
              currentPeriodEnd: developer.apiSubscription.currentPeriodEnd,
            }
          : null,
      });
    } catch (error) {
      logger.error({ error }, 'Get developer profile error');
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }
);

// ============================================================================
// UPDATE PROFILE
// ============================================================================

developerAuthRouter.patch(
  '/me',
  authenticateDeveloper,
  async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.developer) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = updateProfileSchema.parse(req.body);

      const developer = await updateDeveloperProfile(req.developer.id, data);

      res.json({
        developer: {
          id: developer.id,
          email: developer.email,
          name: developer.name,
          company: developer.company,
          website: developer.website,
          isVerified: developer.isVerified,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      logger.error({ error }, 'Update developer profile error');
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// ============================================================================
// CHANGE PASSWORD
// ============================================================================

developerAuthRouter.post(
  '/change-password',
  authenticateDeveloper,
  async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.developer) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = changePasswordSchema.parse(req.body);

      await changeDeveloperPassword(
        req.developer.id,
        data.currentPassword,
        data.newPassword
      );

      res.json({ success: true, message: 'Password changed successfully. Please login again.' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
        return;
      }
      if (error instanceof Error && error.message === 'Current password is incorrect') {
        res.status(401).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Change developer password error');
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);
