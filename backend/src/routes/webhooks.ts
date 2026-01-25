import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { processAppStoreNotification, requestTestNotification } from '../services/appleStoreService.js';
import { webhookLogger } from '../utils/logger.js';
import { idempotencyGuard, appStoreKeyExtractor } from '../middleware/idempotency.js';

export const webhookRouter = Router();

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
