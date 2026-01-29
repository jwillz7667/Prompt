/**
 * API Subscriptions Routes
 *
 * Manage API subscription billing, plans, and invoices.
 * All routes require JWT authentication.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getApiSubscriptionInfo,
  createCheckoutSession,
  createPortalSession,
  cancelApiSubscription,
  getInvoices,
  getAvailablePlans,
  ApiTier,
} from '../services/apiSubscriptionService.js';
import { getMonthlyUsage, calculateBilling } from '../services/apiUsageService.js';
import { logger } from '../utils/logger.js';

export const apiSubscriptionsRouter = Router();

// All routes require authentication
apiSubscriptionsRouter.use(authenticate);

// ============================================================================
// GET /status - Get current API subscription status
// ============================================================================

apiSubscriptionsRouter.get('/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const [subscriptionInfo, monthlyUsage] = await Promise.all([
      getApiSubscriptionInfo(req.user.id),
      getMonthlyUsage(req.user.id),
    ]);

    res.json({
      tier: subscriptionInfo.tier,
      status: subscriptionInfo.status,
      quota: {
        used: subscriptionInfo.currentPeriodUsage,
        limit: subscriptionInfo.monthlyRequestLimit === -1 ? 'unlimited' : subscriptionInfo.monthlyRequestLimit,
        remaining: subscriptionInfo.remainingRequests === -1 ? 'unlimited' : subscriptionInfo.remainingRequests,
      },
      rateLimit: {
        requestsPerMinute: subscriptionInfo.requestsPerMinute,
      },
      period: {
        start: subscriptionInfo.currentPeriodStart,
        end: subscriptionInfo.currentPeriodEnd,
      },
      usage: {
        totalRequests: monthlyUsage.totalRequests,
        includedRequests: monthlyUsage.includedRequests,
        overageRequests: monthlyUsage.overageRequests,
        totalTokens: monthlyUsage.totalTokens,
        estimatedCostCents: monthlyUsage.estimatedCostCents,
      },
      features: subscriptionInfo.features,
      canMakeRequests: subscriptionInfo.canMakeRequests,
      overageAllowed: subscriptionInfo.overageAllowed,
    });
  } catch (error) {
    logger.error({ error }, 'Get API subscription status error');
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// ============================================================================
// GET /plans - Get available API plans
// ============================================================================

apiSubscriptionsRouter.get('/plans', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const plans = getAvailablePlans();

    res.json({
      plans: plans.map((plan) => ({
        id: plan.tier,
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly / 100, // Convert cents to dollars
        monthlyRequests: plan.monthlyRequests === -1 ? 'unlimited' : plan.monthlyRequests,
        requestsPerMinute: plan.requestsPerMinute,
        overagePerHundred: plan.overagePerHundred / 100, // Convert cents to dollars
        features: plan.features,
        recommended: plan.tier === ApiTier.API_STARTER,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Get API plans error');
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

// ============================================================================
// POST /checkout - Create Stripe checkout session
// ============================================================================

const checkoutSchema = z.object({
  tier: z.enum(['API_STARTER', 'API_PRO']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

apiSubscriptionsRouter.post('/checkout', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = checkoutSchema.parse(req.body);

    const result = await createCheckoutSession(
      req.user.id,
      req.user.email,
      data.tier,
      data.successUrl,
      data.cancelUrl
    );

    logger.info({ userId: req.user.id, tier: data.tier }, 'API checkout session created');

    res.json({ url: result.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    logger.error({ error }, 'Create checkout session error');
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ============================================================================
// POST /portal - Create Stripe billing portal session
// ============================================================================

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

apiSubscriptionsRouter.post('/portal', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = portalSchema.parse(req.body);

    const result = await createPortalSession(req.user.id, data.returnUrl);

    res.json({ url: result.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    if (error instanceof Error && error.message.includes('No Stripe customer')) {
      res.status(400).json({
        error: 'No billing account',
        message: 'You need to subscribe to a paid plan first',
      });
      return;
    }
    logger.error({ error }, 'Create portal session error');
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ============================================================================
// POST /cancel - Cancel subscription at period end
// ============================================================================

apiSubscriptionsRouter.post('/cancel', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await cancelApiSubscription(req.user.id);

    logger.info({ userId: req.user.id }, 'API subscription canceled');

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period',
    });
  } catch (error) {
    logger.error({ error }, 'Cancel subscription error');
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ============================================================================
// GET /invoices - Get invoice history
// ============================================================================

const invoicesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

apiSubscriptionsRouter.get('/invoices', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const query = invoicesQuerySchema.parse(req.query);
    const result = await getInvoices(req.user.id, query.limit);

    res.json({
      invoices: result.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        amount: invoice.amountPaid / 100, // Convert cents to dollars
        status: invoice.status,
        date: invoice.created,
        pdfUrl: invoice.pdfUrl,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    logger.error({ error }, 'Get invoices error');
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

// ============================================================================
// GET /billing - Get billing summary for current period
// ============================================================================

apiSubscriptionsRouter.get('/billing', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const subscriptionInfo = await getApiSubscriptionInfo(req.user.id);

    const billing = await calculateBilling(
      req.user.id,
      subscriptionInfo.currentPeriodStart,
      subscriptionInfo.currentPeriodEnd
    );

    res.json({
      period: {
        start: billing.periodStart,
        end: billing.periodEnd,
      },
      requests: {
        included: billing.includedRequests,
        used: billing.usedRequests,
        overage: billing.overageRequests,
      },
      costs: {
        base: billing.basePriceCents / 100,
        overage: billing.overageCostCents / 100,
        total: billing.totalCostCents / 100,
        overageRate: billing.overageRateCents / 100,
      },
      currency: 'USD',
    });
  } catch (error) {
    logger.error({ error }, 'Get billing error');
    res.status(500).json({ error: 'Failed to get billing information' });
  }
});
