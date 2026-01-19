import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const userRouter = Router();

userRouter.use(authenticate);

// ============================================================================
// UPDATE PROFILE
// ============================================================================

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

userRouter.patch('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = updateProfileSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isPremium: true,
      },
    });

    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================================================
// GET USAGE STATS
// ============================================================================

userRouter.get('/stats', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        promptCount: true,
        tokenUsage: true,
        createdAt: true,
        isPremium: true,
        premiumUntil: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get usage for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsage = await prisma.usageRecord.findMany({
      where: {
        userId: req.user.id,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: 'asc' },
    });

    // Get favorite and total counts
    const [totalPrompts, favoritePrompts] = await Promise.all([
      prisma.prompt.count({ where: { userId: req.user.id } }),
      prisma.prompt.count({ where: { userId: req.user.id, isFavorite: true } }),
    ]);

    res.json({
      stats: {
        totalPrompts,
        favoritePrompts,
        totalTokens: user.tokenUsage.toString(),
        memberSince: user.createdAt,
        isPremium: user.isPremium,
        premiumUntil: user.premiumUntil,
      },
      recentUsage: recentUsage.map((r) => ({
        date: r.date,
        promptCount: r.promptCount,
        tokenCount: r.tokenCount.toString(),
      })),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ============================================================================
// GET SESSIONS
// ============================================================================

userRouter.get('/sessions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const sessions = await prisma.session.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        createdAt: true,
        lastActiveAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    // Mark current session
    const currentSessionId = req.user.sessionId;
    const sessionsWithCurrent = sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));

    res.json({ sessions: sessionsWithCurrent });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// ============================================================================
// REVOKE SESSION
// ============================================================================

userRouter.delete('/sessions/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const sessionId = req.params['id'];

    // Don't allow revoking current session via this endpoint
    if (sessionId === req.user.sessionId) {
      res.status(400).json({ error: 'Cannot revoke current session. Use logout instead.' });
      return;
    }

    await prisma.session.deleteMany({
      where: {
        id: sessionId,
        userId: req.user.id,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ============================================================================
// DELETE ACCOUNT
// ============================================================================

userRouter.delete('/account', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Delete all user data (cascades to sessions, prompts, etc.)
    await prisma.user.delete({
      where: { id: req.user.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});
