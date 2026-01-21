import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { processAppStoreNotification, requestTestNotification } from '../services/appleStoreService.js';

export const webhookRouter = Router();

// ============================================================================
// APP STORE SERVER NOTIFICATIONS V2
// ============================================================================

const appStoreNotificationSchema = z.object({
  signedPayload: z.string().min(1),
});

webhookRouter.post('/appstore', async (req: Request, res: Response): Promise<void> => {
  try {
    // Log incoming webhook for debugging
    console.log('Received App Store webhook');

    const { signedPayload } = appStoreNotificationSchema.parse(req.body);

    const result = await processAppStoreNotification(signedPayload);

    // Apple expects a 200 response to acknowledge receipt
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('App Store webhook error:', error);

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
    console.error('Test notification error:', error);
    res.status(500).json({ error: 'Failed to request test notification' });
  }
});
