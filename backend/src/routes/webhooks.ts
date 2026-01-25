import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { processAppStoreNotification, requestTestNotification } from '../services/appleStoreService.js';
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
