import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getSubscriptionInfo,
  startFreeTrial,
  hasUsedTrial,
  getAvailableProducts,
  ensureSubscriptionExists,
} from '../services/subscriptionService.js';
import { getMaxModeQuota } from '../services/maxModeQuotaService.js';
import {
  verifySignedTransaction,
  processVerifiedTransaction,
  PurchaseValidationError,
  validateSubscriptionTransaction,
} from '../services/appleStoreService.js';
import { VerificationException, VerificationStatus } from '@apple/app-store-server-library';
import { subscriptionLogger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';

export const subscriptionRouter = Router();

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
        subscription: {
          tier: subscriptionInfo.tier,
          status: subscriptionInfo.status,
          expiresAt: subscriptionInfo.expiresAt?.toISOString() || null,
          isTrialing: subscriptionInfo.isTrialing,
          trialEndsAt: subscriptionInfo.trialEndsAt?.toISOString() || null,
        },
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

      // Deployed iOS clients decode this into a model requiring isTrialing —
      // omitting it makes the decode throw and the client treats a successful
      // activation as failed, so keep this shape in sync with GET /status.
      res.json({
        success: true,
        subscription: {
          tier: subscriptionInfo.tier,
          status: subscriptionInfo.status,
          expiresAt: subscriptionInfo.expiresAt?.toISOString() || null,
          isTrialing: subscriptionInfo.isTrialing,
          trialEndsAt: subscriptionInfo.trialEndsAt?.toISOString() || null,
        },
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

      // Process all transactions and find the best active one
      let latestValidTransaction: Awaited<ReturnType<typeof verifySignedTransaction>> | null = null;
      let latestExpiration: Date | null = null;

      for (const signedTransaction of signedTransactions) {
        try {
          const transaction = await verifySignedTransaction(signedTransaction);

          validateSubscriptionTransaction(transaction);
          // Upgraded transactions no longer grant the previous tier.
          if (transaction.revocationDate || transaction.isUpgraded) {
            continue;
          }

          // Skip expired transactions without comparing to find the best
          if (transaction.expirationDate && transaction.expirationDate > new Date()) {
            if (!latestExpiration || transaction.expirationDate > latestExpiration) {
              latestValidTransaction = transaction;
              latestExpiration = transaction.expirationDate;
            }
          }
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
          continue;
        }
      }

      if (latestValidTransaction) {
        await processVerifiedTransaction(req.user.id, latestValidTransaction);

        const subscriptionInfo = await getSubscriptionInfo(req.user.id);

        res.json({
          success: true,
          restored: true,
          subscription: {
            tier: subscriptionInfo.tier,
            status: subscriptionInfo.status,
            expiresAt: subscriptionInfo.expiresAt?.toISOString() || null,
            isTrialing: subscriptionInfo.isTrialing,
            trialEndsAt: subscriptionInfo.trialEndsAt?.toISOString() || null,
          },
          features: subscriptionInfo.features,
        });
      } else {
        res.json({
          success: true,
          restored: false,
          message: 'No active subscriptions found',
        });
      }
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
// START FREE TRIAL
// ============================================================================

subscriptionRouter.post(
  '/trial',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const result = await startFreeTrial(req.user.id);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.message,
        });
        return;
      }

      const subscriptionInfo = await getSubscriptionInfo(req.user.id);

      res.json({
        success: true,
        trialEndDate: result.trialEndDate?.toISOString(),
        subscription: {
          tier: subscriptionInfo.tier,
          status: subscriptionInfo.status,
          isTrialing: subscriptionInfo.isTrialing,
          trialEndsAt: subscriptionInfo.trialEndsAt?.toISOString() || null,
        },
        features: subscriptionInfo.features,
      });
    } catch (error) {
      subscriptionLogger.error({ err: error, userId: req.user?.id }, 'Start trial failed');
      res.status(500).json({ error: 'Failed to start trial' });
    }
  },
);

// ============================================================================
// CHECK TRIAL ELIGIBILITY
// ============================================================================

subscriptionRouter.get(
  '/trial/eligibility',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const usedTrial = await hasUsedTrial(req.user.id);

      res.json({
        eligible: !usedTrial,
        trialDays: parseInt(process.env['FREE_TRIAL_DAYS'] || '7', 10),
      });
    } catch (error) {
      subscriptionLogger.error(
        { err: error, userId: req.user?.id },
        'Check trial eligibility failed',
      );
      res.status(500).json({ error: 'Failed to check trial eligibility' });
    }
  },
);

// ============================================================================
// GET AVAILABLE PRODUCTS
// ============================================================================

subscriptionRouter.get(
  '/products',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const products = getAvailableProducts();
      const usedTrial = await hasUsedTrial(req.user.id);

      res.json({
        products: products.map((p) => ({
          ...p,
          trialEligible: p.hasTrial && !usedTrial,
        })),
        trialEligible: !usedTrial,
      });
    } catch (error) {
      subscriptionLogger.error({ err: error, userId: req.user?.id }, 'Get products failed');
      res.status(500).json({ error: 'Failed to get products' });
    }
  },
);
