import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  entitlementConfig,
  getDailyCounter,
  incrementDailyCounter,
} from '../services/subscriptionService.js';
import { clientErrorHttpStatus, toClientStreamError } from '../features/llm/errors.js';
import {
  chatWithSupport,
  getTicket,
  getUserTickets,
  continueTicketChat,
  type SupportMessage,
} from '../services/supportService.js';

export const supportRouter = Router();

// All support routes require authentication. They deliberately do NOT require
// a subscription: lapsed users and App Review must always be able to reach
// support. AI replies are capped per user per UTC day instead.
supportRouter.use(authenticate);

function nextUtcMidnight(): Date {
  const reset = new Date();
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

// Without Redis the counter is unavailable and the cap fails open: support
// staying reachable matters more than a perfectly enforced soft limit.
async function requireSupportReplyAllowance(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const used = await getDailyCounter('support', req.user.id);
  if (used !== null && used >= entitlementConfig.supportAiDailyLimit) {
    res.status(429).json({
      error: 'Daily support assistant limit reached. Your messages can still reach us by email.',
      code: 'SUPPORT_LIMIT_REACHED',
      resetAt: nextUtcMidnight().toISOString(),
    });
    return;
  }
  next();
}

function sendSupportFailure(res: Response, error: unknown, context: string): void {
  logger.error({ err: error }, context);
  const clientError = toClientStreamError(error);
  res.status(clientErrorHttpStatus(clientError.code)).json({
    error: clientError.message,
    code: clientError.code,
    retryable: clientError.retryable,
  });
}

// Validation schemas
const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional(),
});

const ticketChatSchema = z.object({
  message: z.string().min(1).max(5000),
});

// ============================================================================
// CHAT WITH SUPPORT AI (no ticket yet)
// ============================================================================

supportRouter.post(
  '/chat',
  requireSupportReplyAllowance,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = chatSchema.parse(req.body);

      const response = await chatWithSupport({
        userId: req.user.id,
        message: data.message,
        conversationHistory: data.conversationHistory as SupportMessage[] | undefined,
      });
      await incrementDailyCounter('support', req.user.id);

      res.json({
        reply: response.reply,
        ticketCreated: response.ticketCreated,
        ticketId: response.ticketId,
        category: response.category,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: error.issues });
        return;
      }
      sendSupportFailure(res, error, 'Support chat error');
    }
  },
);

// ============================================================================
// GET USER'S TICKETS
// ============================================================================

supportRouter.get('/tickets', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const tickets = await getUserTickets(req.user.id);

    res.json({ tickets });
  } catch (error) {
    logger.error({ err: error }, 'Get tickets error');
    res.status(500).json({ error: 'Failed to get tickets' });
  }
});

// ============================================================================
// GET SINGLE TICKET WITH MESSAGES
// ============================================================================

supportRouter.get(
  '/tickets/:ticketId',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const ticketId = req.params['ticketId'] as string;
      if (!ticketId || typeof ticketId !== 'string') {
        res.status(400).json({ error: 'Ticket ID required' });
        return;
      }

      const ticket = await getTicket(ticketId, req.user.id);

      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }

      res.json({ ticket });
    } catch (error) {
      logger.error({ err: error }, 'Get ticket error');
      res.status(500).json({ error: 'Failed to get ticket' });
    }
  },
);

// ============================================================================
// CONTINUE CHAT ON EXISTING TICKET
// ============================================================================

supportRouter.post(
  '/tickets/:ticketId/chat',
  requireSupportReplyAllowance,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const ticketId = req.params['ticketId'] as string;
      if (!ticketId || typeof ticketId !== 'string') {
        res.status(400).json({ error: 'Ticket ID required' });
        return;
      }

      const data = ticketChatSchema.parse(req.body);

      const response = await continueTicketChat(ticketId, req.user.id, data.message);
      await incrementDailyCounter('support', req.user.id);

      res.json({
        reply: response.reply,
        ticketCreated: response.ticketCreated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: error.issues });
        return;
      }
      if (error instanceof Error && error.message === 'Ticket not found') {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }
      if (error instanceof Error && error.message === 'This ticket has been closed') {
        res.status(400).json({ error: 'This ticket has been closed' });
        return;
      }
      sendSupportFailure(res, error, 'Ticket chat error');
    }
  },
);
