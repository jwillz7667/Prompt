import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  chatWithSupport,
  getTicket,
  getUserTickets,
  continueTicketChat,
  type SupportMessage,
} from '../services/supportService.js';

export const supportRouter = Router();

// All support routes require authentication
supportRouter.use(authenticate);

// Validation schemas
const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

const ticketChatSchema = z.object({
  message: z.string().min(1).max(5000),
});

// ============================================================================
// CHAT WITH SUPPORT AI (no ticket yet)
// ============================================================================

supportRouter.post('/chat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    res.json({
      reply: response.reply,
      ticketCreated: response.ticketCreated,
      ticketId: response.ticketId,
      category: response.category,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
      return;
    }
    logger.error({ err: error }, 'Support chat error');
    res.status(500).json({ error: 'Failed to process support request' });
  }
});

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

supportRouter.get('/tickets/:ticketId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
});

// ============================================================================
// CONTINUE CHAT ON EXISTING TICKET
// ============================================================================

supportRouter.post('/tickets/:ticketId/chat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const response = await continueTicketChat(
      ticketId,
      req.user.id,
      data.message
    );

    res.json({
      reply: response.reply,
      ticketCreated: response.ticketCreated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
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
    logger.error({ err: error }, 'Ticket chat error');
    res.status(500).json({ error: 'Failed to process message' });
  }
});
