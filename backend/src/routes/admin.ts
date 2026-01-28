import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getAllTickets,
  getTicketById,
  addAgentReplyToTicket,
  updateTicketStatus,
} from '../services/supportService.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';
import { sendSupportMessageNotification } from '../services/notificationService.js';

export const adminRouter = Router();

// ============================================================================
// ADMIN AUTHENTICATION MIDDLEWARE
// Simple API key authentication for admin routes
// In production, replace with proper admin authentication
// ============================================================================

const ADMIN_API_KEY = process.env['ADMIN_API_KEY'];

function adminAuth(req: Request, res: Response, next: () => void): void {
  const apiKey = req.headers['x-admin-api-key'] as string;

  if (!ADMIN_API_KEY) {
    logger.warn('ADMIN_API_KEY not configured');
    res.status(500).json({ error: 'Admin authentication not configured' });
    return;
  }

  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

// Apply admin auth to all routes
adminRouter.use(adminAuth);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const replySchema = z.object({
  message: z.string().min(1).max(10000),
});

const statusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']),
});

// ============================================================================
// GET ALL TICKETS
// ============================================================================

adminRouter.get('/tickets', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query['status'] as string | undefined;
    const tickets = await getAllTickets(status);

    res.json({ tickets });
  } catch (error) {
    logger.error({ error }, 'Admin get tickets error');
    res.status(500).json({ error: 'Failed to get tickets' });
  }
});

// ============================================================================
// GET SINGLE TICKET WITH MESSAGES
// ============================================================================

adminRouter.get('/tickets/:ticketId', async (req: Request, res: Response): Promise<void> => {
  try {
    const ticketId = req.params['ticketId'] as string;
    if (!ticketId) {
      res.status(400).json({ error: 'Ticket ID required' });
      return;
    }

    const ticket = await getTicketById(ticketId);

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    res.json({ ticket });
  } catch (error) {
    logger.error({ error }, 'Admin get ticket error');
    res.status(500).json({ error: 'Failed to get ticket' });
  }
});

// ============================================================================
// REPLY TO TICKET (as support agent)
// ============================================================================

adminRouter.post('/tickets/:ticketId/reply', async (req: Request, res: Response): Promise<void> => {
  try {
    const ticketId = req.params['ticketId'] as string;
    if (!ticketId) {
      res.status(400).json({ error: 'Ticket ID required' });
      return;
    }

    const data = replySchema.parse(req.body);

    await addAgentReplyToTicket(ticketId, data.message);

    res.json({ success: true, message: 'Reply sent and user notified via email' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }
    if (error instanceof Error) {
      if (error.message === 'Ticket not found') {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }
      if (error.message === 'Cannot reply to closed tickets') {
        res.status(400).json({ error: 'Cannot reply to closed tickets' });
        return;
      }
    }
    logger.error({ error }, 'Admin reply to ticket error');
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// ============================================================================
// UPDATE TICKET STATUS
// ============================================================================

adminRouter.patch('/tickets/:ticketId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const ticketId = req.params['ticketId'] as string;
    if (!ticketId) {
      res.status(400).json({ error: 'Ticket ID required' });
      return;
    }

    const data = statusSchema.parse(req.body);

    await updateTicketStatus(ticketId, data.status);

    res.json({ success: true, status: data.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }
    logger.error({ error }, 'Admin update ticket status error');
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ============================================================================
// DEBUG: GET DEVICE TOKENS FOR A USER
// ============================================================================

adminRouter.get('/debug/device-tokens/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params['userId'] as string;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const tokens = await prisma.deviceToken.findMany({
      where: { userId },
      select: {
        id: true,
        deviceToken: true,
        deviceId: true,
        deviceType: true,
        environment: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    // Mask the device tokens for security
    const maskedTokens = tokens.map((t) => ({
      ...t,
      deviceToken: t.deviceToken.slice(0, 8) + '...' + t.deviceToken.slice(-8),
    }));

    res.json({
      userId,
      tokenCount: tokens.length,
      activeCount: tokens.filter((t) => t.isActive).length,
      tokens: maskedTokens,
    });
  } catch (error) {
    logger.error({ error }, 'Admin get device tokens error');
    res.status(500).json({ error: 'Failed to get device tokens' });
  }
});

// ============================================================================
// DEBUG: LIST ALL DEVICE TOKENS
// ============================================================================

adminRouter.get('/debug/device-tokens', async (_req: Request, res: Response): Promise<void> => {
  try {
    const tokens = await prisma.deviceToken.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const summary = {
      total: tokens.length,
      active: tokens.filter((t) => t.isActive).length,
      production: tokens.filter((t) => t.environment === 'production').length,
      sandbox: tokens.filter((t) => t.environment === 'sandbox').length,
    };

    // Mask tokens and return
    const maskedTokens = tokens.map((t) => ({
      id: t.id,
      userId: t.userId,
      deviceToken: t.deviceToken.slice(0, 8) + '...' + t.deviceToken.slice(-8),
      environment: t.environment,
      isActive: t.isActive,
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
    }));

    res.json({ summary, tokens: maskedTokens });
  } catch (error) {
    logger.error({ error }, 'Admin list device tokens error');
    res.status(500).json({ error: 'Failed to list device tokens' });
  }
});

// ============================================================================
// DEBUG: TEST PUSH NOTIFICATION
// ============================================================================

adminRouter.post('/debug/test-notification/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params['userId'] as string;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const { message } = req.body;
    const testMessage = message || 'This is a test notification from Promptomize support.';

    // Check if user has any device tokens
    const tokenCount = await prisma.deviceToken.count({
      where: { userId, isActive: true },
    });

    if (tokenCount === 0) {
      res.status(400).json({
        error: 'No active device tokens found for this user',
        suggestion: 'Make sure the user has opened the app and allowed notifications',
      });
      return;
    }

    // Send test notification
    await sendSupportMessageNotification(userId, 'test-ticket', 'Support Team', testMessage);

    res.json({
      success: true,
      message: `Test notification sent to ${tokenCount} device(s)`,
      userId,
    });
  } catch (error) {
    logger.error({ error }, 'Admin test notification error');
    res.status(500).json({ error: 'Failed to send test notification', details: String(error) });
  }
});

// ============================================================================
// DEBUG: CHECK APNS CONFIG
// ============================================================================

adminRouter.get('/debug/apns-config', async (_req: Request, res: Response): Promise<void> => {
  const config = {
    keyIdConfigured: !!process.env['APPLE_KEY_ID'],
    teamIdConfigured: !!process.env['APPLE_TEAM_ID'],
    privateKeyConfigured: !!process.env['APPLE_PRIVATE_KEY'],
    bundleId: process.env['APPLE_BUNDLE_ID'] || 'com.res.promptomizer',
    keyIdPreview: process.env['APPLE_KEY_ID']?.slice(0, 4) + '...',
    teamIdPreview: process.env['APPLE_TEAM_ID']?.slice(0, 4) + '...',
    privateKeyLength: process.env['APPLE_PRIVATE_KEY']?.length || 0,
  };

  res.json(config);
});

// ============================================================================
// DEBUG: LOOKUP USER BY EMAIL
// ============================================================================

adminRouter.get('/debug/user-by-email/:email', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = req.params['email'] as string;
    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        isPremium: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyUsage = await prisma.dailyUsage.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    res.json({
      user,
      subscription,
      dailyUsage: {
        date: today.toISOString().split('T')[0],
        promptCount: dailyUsage?.promptCount || 0,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Admin get user by email error');
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============================================================================
// DEBUG: RESET QUOTA BY EMAIL
// ============================================================================

adminRouter.post('/debug/reset-quota-by-email/:email', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = req.params['email'] as string;
    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await prisma.dailyUsage.deleteMany({
      where: { userId: user.id },
    });

    res.json({
      success: true,
      message: 'Daily quota reset for user',
      email,
      userId: user.id,
    });
  } catch (error) {
    logger.error({ error }, 'Admin reset quota by email error');
    res.status(500).json({ error: 'Failed to reset quota' });
  }
});

// ============================================================================
// DEBUG: SET TIER BY EMAIL
// ============================================================================

adminRouter.post('/debug/set-tier-by-email/:email', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = req.params['email'] as string;
    const { tier } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }

    if (!['FREE', 'PRO', 'PREMIUM'].includes(tier)) {
      res.status(400).json({ error: 'Invalid tier. Must be FREE, PRO, or PREMIUM' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update user's tier
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: tier,
        isPremium: tier !== 'FREE',
      },
    });

    // Update or create subscription
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        tier,
        status: 'ACTIVE',
        expiresAt: tier === 'FREE' ? null : expiresAt,
      },
      create: {
        userId: user.id,
        tier,
        status: 'ACTIVE',
        expiresAt: tier === 'FREE' ? null : expiresAt,
      },
    });

    res.json({
      success: true,
      message: `User tier set to ${tier}`,
      email,
      userId: user.id,
      tier,
    });
  } catch (error) {
    logger.error({ error }, 'Admin set tier by email error');
    res.status(500).json({ error: 'Failed to set tier' });
  }
});

// ============================================================================
// DEBUG: GET USER SUBSCRIPTION & QUOTA INFO
// ============================================================================

adminRouter.get('/debug/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params['userId'] as string;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        isPremium: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyUsage = await prisma.dailyUsage.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    res.json({
      user,
      subscription,
      dailyUsage: {
        date: today.toISOString().split('T')[0],
        promptCount: dailyUsage?.promptCount || 0,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Admin get user error');
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============================================================================
// DEBUG: RESET USER DAILY QUOTA
// ============================================================================

adminRouter.post('/debug/reset-quota/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params['userId'] as string;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyUsage.deleteMany({
      where: { userId },
    });

    res.json({
      success: true,
      message: 'Daily quota reset for user',
      userId,
    });
  } catch (error) {
    logger.error({ error }, 'Admin reset quota error');
    res.status(500).json({ error: 'Failed to reset quota' });
  }
});

// ============================================================================
// DEBUG: SET USER SUBSCRIPTION TIER
// ============================================================================

adminRouter.post('/debug/set-tier/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params['userId'] as string;
    const { tier } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    if (!['FREE', 'PRO', 'PREMIUM'].includes(tier)) {
      res.status(400).json({ error: 'Invalid tier. Must be FREE, PRO, or PREMIUM' });
      return;
    }

    // Update user's tier
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: tier,
        isPremium: tier !== 'FREE',
      },
    });

    // Update or create subscription
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await prisma.subscription.upsert({
      where: { userId },
      update: {
        tier,
        status: 'ACTIVE',
        expiresAt: tier === 'FREE' ? null : expiresAt,
      },
      create: {
        userId,
        tier,
        status: 'ACTIVE',
        expiresAt: tier === 'FREE' ? null : expiresAt,
      },
    });

    res.json({
      success: true,
      message: `User tier set to ${tier}`,
      userId,
      tier,
    });
  } catch (error) {
    logger.error({ error }, 'Admin set tier error');
    res.status(500).json({ error: 'Failed to set tier' });
  }
});
