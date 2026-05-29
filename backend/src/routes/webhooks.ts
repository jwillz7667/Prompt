import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Webhook } from 'svix';
import { processAppStoreNotification, requestTestNotification } from '../services/appleStoreService.js';
import { addAgentReplyToTicket, addMessageToTicket } from '../services/supportService.js';
import { webhookLogger } from '../utils/logger.js';
import { idempotencyGuard, appStoreKeyExtractor } from '../middleware/idempotency.js';
import { prisma } from '../utils/prisma.js';
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';

export const webhookRouter = Router();

// ============================================================================
// STRIPE WEBHOOK (from Next.js web app)
// ============================================================================

const BACKEND_WEBHOOK_SECRET = process.env['BACKEND_WEBHOOK_SECRET'] || '';

const stripeWebhookSchema = z.object({
  event: z.enum(['subscription.created', 'subscription.updated', 'subscription.deleted', 'payment.failed']),
  data: z.record(z.unknown()),
});

webhookRouter.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify webhook secret
    const webhookSecret = req.headers['x-webhook-secret'];
    if (!BACKEND_WEBHOOK_SECRET || webhookSecret !== BACKEND_WEBHOOK_SECRET) {
      webhookLogger.warn('Invalid Stripe webhook secret');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { event, data } = stripeWebhookSchema.parse(req.body);
    webhookLogger.info({ event }, 'Received Stripe webhook from web app');

    switch (event) {
      case 'subscription.created':
      case 'subscription.updated': {
        const {
          userId,
          stripeCustomerId,
          stripeSubscriptionId,
          stripePriceId,
          tier,
          status,
          currentPeriodEnd,
          cancelAtPeriodEnd,
        } = data as {
          userId: string;
          stripeCustomerId?: string;
          stripeSubscriptionId: string;
          stripePriceId: string;
          tier: string;
          status: string;
          currentPeriodEnd: string;
          cancelAtPeriodEnd: boolean;
        };

        // Map Stripe status to our status
        let subscriptionStatus: SubscriptionStatus = SubscriptionStatus.ACTIVE;
        if (status === 'canceled') {
          subscriptionStatus = SubscriptionStatus.CANCELED;
        } else if (status === 'past_due') {
          subscriptionStatus = SubscriptionStatus.GRACE_PERIOD;
        }

        // Map tier
        const subscriptionTier = tier === 'PREMIUM'
          ? SubscriptionTier.PREMIUM
          : tier === 'PRO'
            ? SubscriptionTier.PRO
            : SubscriptionTier.FREE;

        // Update or create subscription
        await prisma.subscription.upsert({
          where: { userId },
          update: {
            tier: subscriptionTier,
            status: subscriptionStatus,
            stripeSubscriptionId,
            stripePriceId,
            expiresAt: new Date(currentPeriodEnd),
            cancelAtPeriodEnd,
            isTrialing: false,
          },
          create: {
            userId,
            tier: subscriptionTier,
            status: subscriptionStatus,
            stripeSubscriptionId,
            stripePriceId,
            expiresAt: new Date(currentPeriodEnd),
            cancelAtPeriodEnd,
          },
        });

        // Update user's Stripe customer ID and tier
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: stripeCustomerId || undefined,
            subscriptionTier,
            isPremium: subscriptionTier !== SubscriptionTier.FREE,
          },
        });

        webhookLogger.info({ userId, tier: subscriptionTier }, 'Stripe subscription updated');
        break;
      }

      case 'subscription.deleted': {
        const { userId, stripeSubscriptionId } = data as {
          userId: string;
          stripeSubscriptionId: string;
        };

        // Downgrade to free
        await prisma.subscription.update({
          where: { userId },
          data: {
            tier: SubscriptionTier.FREE,
            status: SubscriptionStatus.CANCELED,
            stripeSubscriptionId: null,
            stripePriceId: null,
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: SubscriptionTier.FREE,
            isPremium: false,
          },
        });

        webhookLogger.info({ userId }, 'Stripe subscription deleted, downgraded to FREE');
        break;
      }

      case 'payment.failed': {
        const { userId, invoiceId } = data as { userId: string; invoiceId: string };

        // Mark as grace period
        await prisma.subscription.update({
          where: { userId },
          data: {
            status: SubscriptionStatus.GRACE_PERIOD,
          },
        });

        webhookLogger.warn({ userId, invoiceId }, 'Payment failed, entered grace period');
        break;
      }
    }

    res.json({ success: true });
  } catch (error) {
    webhookLogger.error({ err: error }, 'Stripe webhook error');

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// ============================================================================
// APP STORE SERVER NOTIFICATIONS V2
// ============================================================================

const appStoreNotificationSchema = z.object({
  signedPayload: z.string().min(1),
});

// Apply idempotency guard to prevent duplicate webhook processing
webhookRouter.post(
  '/appstore',
  idempotencyGuard({
    endpoint: '/api/v1/webhooks/appstore',
    keyExtractor: appStoreKeyExtractor,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  }),
  async (req: Request, res: Response): Promise<void> => {
  try {
    webhookLogger.debug('Received App Store webhook');

    const { signedPayload } = appStoreNotificationSchema.parse(req.body);

    const result = await processAppStoreNotification(signedPayload);

    // Apple expects a 200 response to acknowledge receipt
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    webhookLogger.error({ err: error }, 'App Store webhook error');

    if (error instanceof z.ZodError) {
      // Still return 200 to prevent Apple from retrying for malformed requests
      res.status(200).json({
        success: false,
        error: 'Invalid notification format',
      });
      return;
    }

    // Return 500 so Apple will retry
    res.status(500).json({
      success: false,
      error: 'Failed to process notification',
    });
  }
});

// ============================================================================
// TEST NOTIFICATION (Development only)
// ============================================================================

webhookRouter.post('/appstore/test', async (req: Request, res: Response): Promise<void> => {
  if (process.env['NODE_ENV'] === 'production') {
    res.status(403).json({ error: 'Test endpoint not available in production' });
    return;
  }

  try {
    const token = await requestTestNotification();
    res.json({
      success: true,
      testNotificationToken: token,
    });
  } catch (error) {
    webhookLogger.error({ err: error }, 'Test notification error');
    res.status(500).json({ error: 'Failed to request test notification' });
  }
});

// ============================================================================
// RESEND INBOUND EMAIL WEBHOOK
// Process email replies to support tickets
// ============================================================================

const RESEND_WEBHOOK_SECRET = process.env['RESEND_WEBHOOK_SECRET'] || '';

function normalizeEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

const RESEND_TRUSTED_AGENT_EMAILS = new Set(
  (process.env['RESEND_TRUSTED_AGENT_EMAILS'] || process.env['SUPPORT_EMAIL'] || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
);

if (process.env['NODE_ENV'] === 'production' && !RESEND_WEBHOOK_SECRET) {
  throw new Error('RESEND_WEBHOOK_SECRET must be set in production');
}

function verifyResendWebhookSignature(req: Request): boolean {
  if (!RESEND_WEBHOOK_SECRET) {
    return process.env['NODE_ENV'] !== 'production';
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    webhookLogger.error('Missing raw body for Resend webhook verification');
    return false;
  }

  const svixId = req.header('svix-id');
  const svixTimestamp = req.header('svix-timestamp');
  const svixSignature = req.header('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  try {
    const webhook = new Webhook(RESEND_WEBHOOK_SECRET);
    webhook.verify(rawBody.toString('utf8'), {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
    return true;
  } catch (error) {
    webhookLogger.warn({ error }, 'Invalid Resend webhook signature');
    return false;
  }
}

// Resend inbound email webhook payload schema
const resendInboundSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().optional(),
    from: z.string(),
    to: z.array(z.string()),
    subject: z.string(),
    text: z.string().optional(),
    html: z.string().optional(),
    headers: z.array(z.object({
      name: z.string(),
      value: z.string(),
    })).optional(),
  }),
});

webhookRouter.post('/resend/inbound', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!verifyResendWebhookSignature(req)) {
      webhookLogger.warn('Rejected Resend inbound webhook with missing or invalid signature');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = resendInboundSchema.parse(req.body);
    webhookLogger.info({ type: payload.type, from: payload.data.from, subject: payload.data.subject }, 'Received Resend inbound email');

    // Only process email.received events
    if (payload.type !== 'email.received') {
      res.status(200).json({ success: true, message: 'Event type ignored' });
      return;
    }

    const { from, subject, text, html } = payload.data;

    // Extract ticket ID from subject line
    // Format: "Re: [PRIORITY] Ticket #ABCD1234: Subject" or just "#ABCD1234"
    const ticketIdMatch = subject.match(/#([A-Z0-9]{8})/i);

    if (!ticketIdMatch || !ticketIdMatch[1]) {
      webhookLogger.warn({ subject }, 'Could not extract ticket ID from email subject');
      res.status(200).json({ success: false, message: 'No ticket ID found in subject' });
      return;
    }

    const shortTicketId = ticketIdMatch[1].toLowerCase();

    // Find the ticket by short ID prefix
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: {
          startsWith: shortTicketId,
        },
      },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    if (!ticket) {
      webhookLogger.warn({ shortTicketId }, 'Ticket not found for inbound email');
      res.status(200).json({ success: false, message: 'Ticket not found' });
      return;
    }

    // Extract the reply content (prefer text, fallback to stripping HTML)
    let replyContent = text || '';

    if (!replyContent && html) {
      // Basic HTML to text conversion
      replyContent = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
    }

    // Remove quoted content (lines starting with > or "On ... wrote:")
    const lines = replyContent.split('\n');
    const cleanLines: string[] = [];
    let hitQuote = false;

    for (const line of lines) {
      // Stop at quote markers
      if (line.match(/^On .+ wrote:$/i) || line.match(/^-{3,}/) || line.match(/^>{2,}/)) {
        hitQuote = true;
        break;
      }
      // Skip quoted lines
      if (line.startsWith('>')) {
        continue;
      }
      if (!hitQuote) {
        cleanLines.push(line);
      }
    }

    replyContent = cleanLines.join('\n').trim();

    // Remove email signature (common patterns)
    replyContent = replyContent
      .replace(/--\s*\n[\s\S]*$/m, '') // Standard -- signature marker
      .replace(/Sent from my [\w\s]+$/i, '')
      .replace(/Get Outlook for [\w\s]+$/i, '')
      .trim();

    if (!replyContent) {
      webhookLogger.warn({ ticketId: ticket.id }, 'Empty reply content after cleaning');
      res.status(200).json({ success: false, message: 'Empty reply content' });
      return;
    }

    const senderEmail = normalizeEmail(from);
    const userEmail = normalizeEmail(ticket.user.email);

    if (RESEND_TRUSTED_AGENT_EMAILS.has(senderEmail)) {
      await addAgentReplyToTicket(ticket.id, replyContent);
    } else if (senderEmail === userEmail) {
      await addMessageToTicket(ticket.id, ticket.userId, replyContent, 'user', false);
    } else {
      webhookLogger.warn({ ticketId: ticket.id, from }, 'Rejected inbound email from untrusted sender');
      res.status(202).json({ success: false, message: 'Sender is not authorized for this ticket' });
      return;
    }

    webhookLogger.info({ ticketId: ticket.id, from }, 'Processed inbound email reply');
    res.status(200).json({ success: true, ticketId: ticket.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      webhookLogger.warn({ error: error.errors }, 'Invalid Resend inbound webhook format');
      res.status(200).json({ success: false, error: 'Invalid format' });
      return;
    }

    webhookLogger.error({ error }, 'Resend inbound webhook error');
    res.status(500).json({ success: false, error: 'Failed to process inbound email' });
  }
});
