import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getSubscriptionInfo,
  getAvailableProducts,
  ensureSubscriptionExists,
  type SubscriptionInfo,
} from '../services/subscriptionService.js';
import { getMaxModeQuota } from '../services/maxModeQuotaService.js';
import {
  verifySignedTransaction,
  processVerifiedTransaction,
  PurchaseValidationError,
  validateSubscriptionTransaction,
  type VerifiedTransaction,
} from '../services/appleStoreService.js';
import { VerificationException, VerificationStatus } from '@apple/app-store-server-library';
import { subscriptionLogger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';

export const subscriptionRouter = Router();

// Deployed iOS clients decode this into a model requiring isTrialing, so every
// endpoint that returns a subscription uses this one shape.
function subscriptionPayload(info: SubscriptionInfo) {
  return {
    tier: info.tier,
    status: info.status,
    expiresAt: info.expiresAt?.toISOString() || null,
    isTrialing: info.isTrialing,
    trialEndsAt: info.trialEndsAt?.toISOString() || null,
    productId: info.productId,
    isEntitled: info.isEntitled,
  };
}

// All subscription routes require authentication
subscriptionRouter.use(authenticate);

// ============================================================================
// GET SUBSCRIPTION STATUS
// ============================================================================

subscriptionRouter.get(
  '/status',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Ensure subscription record exists
      await ensureSubscriptionExists(req.user.id);

      const [subscriptionInfo, user, billing] = await Promise.all([
        getSubscriptionInfo(req.user.id),
        prisma.user.findUnique({
          where: { id: req.user.id },
          select: { stripeCustomerId: true },
        }),
        prisma.subscription.findUnique({
          where: { userId: req.user.id },
          select: {
            originalTransactionId: true,
            stripeSubscriptionId: true,
            autoRenewEnabled: true,
          },
        }),
      ]);
      const maxModeQuota = await getMaxModeQuota(req.user.id, subscriptionInfo.tier);

      res.json({
        isEntitled: subscriptionInfo.isEntitled,
        subscription: subscriptionPayload(subscriptionInfo),
        usage: {
          dailyPromptsUsed: subscriptionInfo.dailyPromptsUsed,
          dailyPromptsLimit: subscriptionInfo.dailyPromptsLimit,
          canCreatePrompt: subscriptionInfo.canPerformAction,
          maxModeUsedToday: maxModeQuota.usedToday,
          maxModeDailyLimit: maxModeQuota.dailyLimit,
          maxModeRemaining: maxModeQuota.isUnlimited ? -1 : maxModeQuota.remaining,
        },
        features: subscriptionInfo.features,
        billingProvider: billing?.stripeSubscriptionId
          ? 'stripe'
          : billing?.originalTransactionId
            ? 'appstore'
            : null,
        autoRenewEnabled: billing?.autoRenewEnabled ?? false,
        // Stripe customer ID for web portal
        stripeCustomerId: user?.stripeCustomerId || null,
      });
    } catch (error) {
      subscriptionLogger.error(
        { err: error, userId: req.user?.id },
        'Failed to get subscription status',
      );
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  },
);

// ============================================================================
// VERIFY PURCHASE
// ============================================================================

const verifyPurchaseSchema = z.object({
  signedTransaction: z.string().min(1).max(100_000),
});

subscriptionRouter.post(
  '/verify',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { signedTransaction } = verifyPurchaseSchema.parse(req.body);

      // Verify the transaction with Apple
      const transaction = await verifySignedTransaction(signedTransaction);

      // Process and update user's subscription
      await processVerifiedTransaction(req.user.id, transaction);

      // Get updated subscription info
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);

      res.json({
        success: true,
        isEntitled: subscriptionInfo.isEntitled,
        subscription: subscriptionPayload(subscriptionInfo),
        features: subscriptionInfo.features,
      });
    } catch (error) {
      subscriptionLogger.error(
        { err: error, userId: req.user?.id },
        'Purchase verification failed',
      );

      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.issues });
        return;
      }

      // Apple rejected the signed transaction itself — a permanent failure the
      // client must not retry (400), unlike infra errors below (500).
      if (error instanceof PurchaseValidationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
        return;
      }

      if (
        error instanceof VerificationException &&
        error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
      ) {
        res
          .status(503)
          .json({ error: 'Apple verification is temporarily unavailable. Please retry.' });
        return;
      }
      if (error instanceof VerificationException) {
        res.status(400).json({ error: 'Invalid transaction', code: 'TRANSACTION_INVALID' });
        return;
      }

      res.status(500).json({ error: 'Failed to verify purchase' });
    }
  },
);

// ============================================================================
// RESTORE PURCHASES
// ============================================================================

const restorePurchasesSchema = z.object({
  signedTransactions: z.array(z.string().min(1).max(100_000)).max(100),
});

subscriptionRouter.post(
  '/restore',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { signedTransactions } = restorePurchasesSchema.parse(req.body);

      if (signedTransactions.length === 0) {
        res.json({
          success: true,
          restored: false,
          message: 'No purchases to restore',
        });
        return;
      }

      // Verify everything first, then claim candidates newest-expiry first.
      // A candidate owned by another account is skipped so a different,
      // claimable purchase can still restore; if every candidate was owned
      // elsewhere the caller gets the ownership conflict, not "nothing found".
      const candidates: VerifiedTransaction[] = [];
      for (const signedTransaction of signedTransactions) {
        try {
          const transaction = await verifySignedTransaction(signedTransaction);
          validateSubscriptionTransaction(transaction);
          // Upgraded transactions no longer grant the previous tier.
          if (transaction.revocationDate || transaction.isUpgraded) continue;
          if (transaction.expirationDate > new Date()) candidates.push(transaction);
        } catch (e) {
          if (
            (e instanceof VerificationException &&
              e.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) ||
            (!(e instanceof VerificationException) && !(e instanceof PurchaseValidationError))
          ) {
            throw e;
          }
          subscriptionLogger.warn(
            { err: e, userId: req.user?.id },
            'Failed to verify transaction during restore',
          );
        }
      }
      candidates.sort(
        (a, b) => (b.expirationDate?.getTime() ?? 0) - (a.expirationDate?.getTime() ?? 0),
      );

      let ownershipConflict: PurchaseValidationError | null = null;
      let restored = false;
      for (const candidate of candidates) {
        try {
          await processVerifiedTransaction(req.user.id, candidate);
          restored = true;
          break;
        } catch (e) {
          if (
            e instanceof PurchaseValidationError &&
            e.code === 'TRANSACTION_OWNED_BY_ANOTHER_USER'
          ) {
            ownershipConflict = e;
            continue;
          }
          throw e;
        }
      }

      if (restored) {
        const subscriptionInfo = await getSubscriptionInfo(req.user.id);
        res.json({
          success: true,
          restored: true,
          isEntitled: subscriptionInfo.isEntitled,
          subscription: subscriptionPayload(subscriptionInfo),
          features: subscriptionInfo.features,
        });
        return;
      }
      if (ownershipConflict) {
        res
          .status(ownershipConflict.statusCode)
          .json({ error: ownershipConflict.message, code: ownershipConflict.code });
        return;
      }
      res.json({
        success: true,
        restored: false,
        message: 'No active subscriptions found',
      });
    } catch (error) {
      subscriptionLogger.error({ err: error, userId: req.user?.id }, 'Restore purchases failed');

      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.issues });
        return;
      }

      if (error instanceof PurchaseValidationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
        return;
      }
      res
        .status(503)
        .json({ error: 'Purchase verification is temporarily unavailable. Please retry.' });
    }
  },
);

// ============================================================================
// GET AVAILABLE PRODUCTS
// ============================================================================

// Free trials are Apple introductory offers decided by StoreKit; the server
// never grants or advertises its own trial.
subscriptionRouter.get('/products', (_req: AuthenticatedRequest, res: Response): void => {
  res.json({ products: getAvailableProducts() });
});
