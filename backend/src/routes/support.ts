import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  entitlementConfig,
  reserveDailyUsage,
  type UsageReservation,
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
// support. AI replies are capped per user per UTC day instead, and the
// assistant only ever sees its own system prompt plus the caller's turns.
supportRouter.use(authenticate);

/**
 * Reserves one AI reply against SUPPORT_AI_DAILY_LIMIT before the model call
 * (atomic, Postgres-backed, so it neither races nor fails open without Redis)
 * or answers 429. The caller releases the unit when no reply was produced.
 */
async function reserveSupportReply(
  userId: string,
  res: Response,
): Promise<UsageReservation | undefined> {
  const result = await reserveDailyUsage(
    'supportReply',
    userId,
    1,
    entitlementConfig.supportAiDailyLimit,
  );
  if (result.isAllowed) return result.reservation;
  res.status(429).json({
    error: 'Daily support assistant limit reached. Your messages can still reach us by email.',
    code: 'SUPPORT_LIMIT_REACHED',
    resetAt: result.resetAt.toISOString(),
  });
  return undefined;
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

// The client still sends its whole transcript (shipped builds), so the
// schema bounds what is accepted and the route forwards only the caller's own
// recent turns. Assistant turns are dropped: a client could otherwise forge
// "assistant" replies that steer the support bot into a general assistant.
const SUPPORT_HISTORY_MAX_TURNS = 10;
const SUPPORT_HISTORY_MAX_CHARS = 2000;

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(10_000),
      }),
    )
    .max(200)
    .optional(),
});

export function trustedSupportHistory(
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }> | undefined,
): SupportMessage[] {
  return (history ?? [])
    .filter((turn) => turn.role === 'user' && turn.content.trim().length > 0)
    .slice(-SUPPORT_HISTORY_MAX_TURNS)
    .map((turn) => ({ role: 'user', content: turn.content.slice(0, SUPPORT_HISTORY_MAX_CHARS) }));
}

const ticketChatSchema = z.object({
  message: z.string().min(1).max(5000),
});

// ============================================================================
// CHAT WITH SUPPORT AI (no ticket yet)
// ============================================================================

supportRouter.post(
  '/chat',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    let reservation: UsageReservation | undefined;
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const data = chatSchema.parse(req.body);
      reservation = await reserveSupportReply(req.user.id, res);
      if (!reservation) return;

      const response = await chatWithSupport({
        userId: req.user.id,
        message: data.message,
        conversationHistory: trustedSupportHistory(data.conversationHistory),
        ticketTranscript: data.conversationHistory?.slice(-50),
      });
      reservation = undefined;

      res.json({
        reply: response.reply,
        ticketCreated: response.ticketCreated,
        ticketId: response.ticketId,
        category: response.category,
      });
    } catch (error) {
      await reservation?.release();
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
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    let reservation: UsageReservation | undefined;
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
      reservation = await reserveSupportReply(req.user.id, res);
      if (!reservation) return;

      const response = await continueTicketChat(ticketId, req.user.id, data.message);
      // A human agent handling the ticket means no model call was made.
      if (response.agentHandling) await reservation.release();
      reservation = undefined;

      res.json({
        reply: response.reply,
        ticketCreated: response.ticketCreated,
      });
    } catch (error) {
      await reservation?.release();
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
