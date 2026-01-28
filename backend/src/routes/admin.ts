import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getAllTickets,
  getTicketById,
  addAgentReplyToTicket,
  updateTicketStatus,
} from '../services/supportService.js';
import { logger } from '../utils/logger.js';

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
