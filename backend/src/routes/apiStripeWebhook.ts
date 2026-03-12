/**
 * API Stripe Webhook Handler
 *
 * Handles Stripe webhook events for API subscriptions.
 * Separate from the main app subscription webhooks.
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { logger } from '../utils/logger.js';
import {
  updateApiSubscription,
  resetPeriodUsage,
  addPurchasedCredits,
  ApiTier,
} from '../services/apiSubscriptionService.js';
import { ApiSubscriptionStatus, IdempotencyStatus, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

export const apiStripeWebhookRouter = Router();

// Initialize Stripe only if API key is configured
const stripeApiKey = process.env['STRIPE_API_SECRET_KEY'];
const stripe = stripeApiKey ? new Stripe(stripeApiKey) : null;

const webhookSecret = process.env['STRIPE_API_WEBHOOK_SECRET'] || '';

// ============================================================================
// TIER MAPPING
// ============================================================================

const PRICE_TO_TIER: Record<string, ApiTier> = {
  [process.env['STRIPE_API_STARTER_PRICE_ID'] || '']: ApiTier.API_STARTER,
  [process.env['STRIPE_API_PRO_PRICE_ID'] || '']: ApiTier.API_PRO,
};

function getTierFromPriceId(priceId: string): ApiTier {
  return PRICE_TO_TIER[priceId] || ApiTier.API_FREE;
}

async function beginWebhookProcessing(event: Stripe.Event): Promise<'process' | 'skip'> {
  const idempotencyKey = `api-stripe:${event.id}`;

  const existing = await prisma.webhookIdempotencyKey.findUnique({
    where: { idempotencyKey },
  });

  if (existing?.status === IdempotencyStatus.COMPLETED) {
    logger.info({ eventId: event.id, eventType: event.type }, 'Skipping previously processed API Stripe webhook');
    return 'skip';
  }

  if (existing?.status === IdempotencyStatus.PROCESSING) {
    logger.warn({ eventId: event.id, eventType: event.type }, 'API Stripe webhook already processing');
    return 'skip';
  }

  if (existing) {
    await prisma.webhookIdempotencyKey.delete({
      where: { id: existing.id },
    });
  }

  await prisma.webhookIdempotencyKey.create({
    data: {
      idempotencyKey,
      endpoint: '/api/v1/webhooks/api-stripe',
      payload: event as unknown as Prisma.InputJsonValue,
      status: IdempotencyStatus.PROCESSING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return 'process';
}

async function completeWebhookProcessing(event: Stripe.Event): Promise<void> {
  await prisma.webhookIdempotencyKey.update({
    where: { idempotencyKey: `api-stripe:${event.id}` },
    data: {
      status: IdempotencyStatus.COMPLETED,
      statusCode: 200,
      responseBody: { received: true } as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

async function failWebhookProcessing(event: Stripe.Event): Promise<void> {
  await prisma.webhookIdempotencyKey.updateMany({
    where: { idempotencyKey: `api-stripe:${event.id}` },
    data: {
      status: IdempotencyStatus.FAILED,
      completedAt: new Date(),
    },
  });
}

// ============================================================================
// RAW BODY MIDDLEWARE
// ============================================================================

// Note: This route needs raw body for signature verification.
// The main Express app should be configured to preserve raw body for webhook routes.

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

apiStripeWebhookRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  if (!stripe) {
    logger.error('STRIPE_API_SECRET_KEY not configured');
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'];

  if (!sig || typeof sig !== 'string') {
    logger.warn('Missing Stripe signature header');
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  if (!webhookSecret) {
    logger.error('STRIPE_API_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  let event: Stripe.Event;

  try {
    // Use raw body for signature verification
    const rawBody = (req as Request & { rawBody?: Buffer | string }).rawBody || req.body;
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      webhookSecret
    );
  } catch (err) {
    logger.error({ err }, 'Stripe webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Received API Stripe webhook');

  try {
    const idempotencyState = await beginWebhookProcessing(event);

    if (idempotencyState === 'skip') {
      res.json({ received: true });
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.debug({ eventType: event.type }, 'Unhandled event type');
    }

    await completeWebhookProcessing(event);
    res.json({ received: true });
  } catch (error) {
    await failWebhookProcessing(event);
    logger.error({ error, eventType: event.type }, 'Error processing webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata || {};
  const userId = metadata['userId'];

  if (!userId) {
    logger.warn({ subscriptionId: subscription.id }, 'No userId in subscription metadata');
    return;
  }

  // Only process API subscriptions
  if (metadata['type'] !== 'api_subscription') {
    logger.debug({ subscriptionId: subscription.id }, 'Not an API subscription, skipping');
    return;
  }

  // Get the price ID from the first item
  const priceId = subscription.items.data[0]?.price.id || '';
  const tier = metadata['tier'] as ApiTier || getTierFromPriceId(priceId);

  // Map Stripe status to our status
  let status: ApiSubscriptionStatus;
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      status = ApiSubscriptionStatus.ACTIVE;
      break;
    case 'past_due':
      status = ApiSubscriptionStatus.PAST_DUE;
      break;
    case 'canceled':
    case 'unpaid':
      status = ApiSubscriptionStatus.CANCELED;
      break;
    default:
      status = ApiSubscriptionStatus.SUSPENDED;
  }

  // Extract period dates from subscription object (using type assertion for Stripe API compatibility)
  const subData = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = subData.current_period_start
    ? new Date(subData.current_period_start * 1000)
    : new Date();
  const periodEnd = subData.current_period_end
    ? new Date(subData.current_period_end * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await updateApiSubscription(userId, {
    tier,
    status,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id,
    stripePriceId: priceId,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  logger.info(
    { userId, tier, status, subscriptionId: subscription.id },
    'API subscription updated'
  );
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata || {};
  const developerId = metadata['developerId'];

  if (!developerId) {
    logger.warn({ sessionId: session.id }, 'No developerId in API Stripe checkout metadata');
    return;
  }

  if (metadata['type'] !== 'api_credit_purchase') {
    logger.debug({ sessionId: session.id }, 'Checkout session is not an API credit purchase');
    return;
  }

  if (session.mode !== 'payment') {
    logger.debug({ sessionId: session.id, mode: session.mode }, 'Ignoring non-payment API credit checkout session');
    return;
  }

  if (session.payment_status !== 'paid') {
    logger.info({ sessionId: session.id, paymentStatus: session.payment_status }, 'API credit checkout not paid yet');
    return;
  }

  const fulfillmentKey = `api-credit-session:${session.id}`;
  const existingFulfillment = await prisma.webhookIdempotencyKey.findUnique({
    where: { idempotencyKey: fulfillmentKey },
  });

  if (existingFulfillment?.status === IdempotencyStatus.COMPLETED) {
    logger.info({ sessionId: session.id }, 'API credit checkout session already fulfilled');
    return;
  }

  if (!existingFulfillment) {
    try {
      await prisma.webhookIdempotencyKey.create({
        data: {
          idempotencyKey: fulfillmentKey,
          endpoint: '/api/v1/webhooks/api-stripe/credits',
          payload: session as unknown as Prisma.InputJsonValue,
          status: IdempotencyStatus.PROCESSING,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (error) {
      logger.warn({ error, sessionId: session.id }, 'API credit checkout fulfillment is already being processed');
      return;
    }
  }

  const credits = Number.parseInt(metadata['credits'] || '0', 10);

  if (!Number.isFinite(credits) || credits <= 0) {
    logger.warn({ sessionId: session.id, credits: metadata['credits'] }, 'Invalid API credit amount in checkout metadata');
    return;
  }

  await addPurchasedCredits(developerId, credits);

  if (typeof session.customer === 'string') {
    await prisma.apiSubscription.upsert({
      where: { developerId },
      update: {
        stripeCustomerId: session.customer,
      },
      create: {
        developerId,
        tier: ApiTier.API_FREE,
        status: ApiSubscriptionStatus.ACTIVE,
        stripeCustomerId: session.customer,
        includedRequests: 100 + credits,
        overageRateCents: 0,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currentPeriodUsage: 0,
      },
    });
  }

  await prisma.webhookIdempotencyKey.update({
    where: { idempotencyKey: fulfillmentKey },
    data: {
      status: IdempotencyStatus.COMPLETED,
      statusCode: 200,
      responseBody: { credits } as Prisma.InputJsonValue,
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  logger.info(
    { developerId, sessionId: session.id, credits, packId: metadata['creditPackId'] },
    'API credit purchase applied'
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata || {};
  const userId = metadata['userId'];

  if (!userId) {
    logger.warn({ subscriptionId: subscription.id }, 'No userId in subscription metadata');
    return;
  }

  if (metadata['type'] !== 'api_subscription') {
    return;
  }

  // Downgrade to free tier
  await updateApiSubscription(userId, {
    tier: ApiTier.API_FREE,
    status: ApiSubscriptionStatus.CANCELED,
    stripeSubscriptionId: undefined,
    stripePriceId: undefined,
  });

  logger.info({ userId, subscriptionId: subscription.id }, 'API subscription canceled');
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  // Extract subscription ID from invoice (handle different Stripe API versions)
  const invoiceData = invoice as unknown as { subscription?: string | { id: string } | null };
  const subscriptionId = typeof invoiceData.subscription === 'string'
    ? invoiceData.subscription
    : invoiceData.subscription?.id;

  if (!subscriptionId) {
    return;
  }

  // Get subscription to find userId
  try {
    // Note: stripe is verified non-null in the main handler before calling this function
    const subscription = await stripe!.subscriptions.retrieve(subscriptionId);
    const metadata = subscription.metadata || {};
    const userId = metadata['userId'];

    if (!userId || metadata['type'] !== 'api_subscription') {
      return;
    }

    // Extract period dates (using type assertion for Stripe API compatibility)
    const subData = subscription as unknown as {
      current_period_start?: number;
      current_period_end?: number;
    };
    const periodStart = subData.current_period_start
      ? new Date(subData.current_period_start * 1000)
      : new Date();
    const periodEnd = subData.current_period_end
      ? new Date(subData.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Reset period usage on successful payment (new billing cycle)
    if (invoice.billing_reason === 'subscription_cycle') {
      await resetPeriodUsage(userId, periodStart, periodEnd);

      logger.info(
        { userId, subscriptionId, periodStart, periodEnd },
        'API subscription period reset after payment'
      );
    }

    // If subscription was past_due, mark it active again
    if (subscription.status === 'active') {
      await updateApiSubscription(userId, {
        tier: getTierFromPriceId(subscription.items.data[0]?.price.id || ''),
        status: ApiSubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });
    }
  } catch (error) {
    logger.error({ error, subscriptionId }, 'Error handling invoice.paid');
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  // Extract subscription ID from invoice (handle different Stripe API versions)
  const invoiceData = invoice as unknown as { subscription?: string | { id: string } | null };
  const subscriptionId = typeof invoiceData.subscription === 'string'
    ? invoiceData.subscription
    : invoiceData.subscription?.id;

  if (!subscriptionId) {
    return;
  }

  try {
    // Note: stripe is verified non-null in the main handler before calling this function
    const subscription = await stripe!.subscriptions.retrieve(subscriptionId);
    const metadata = subscription.metadata || {};
    const userId = metadata['userId'];

    if (!userId || metadata['type'] !== 'api_subscription') {
      return;
    }

    // Mark subscription as past due
    await updateApiSubscription(userId, {
      tier: getTierFromPriceId(subscription.items.data[0]?.price.id || ''),
      status: ApiSubscriptionStatus.PAST_DUE,
    });

    logger.warn(
      { userId, subscriptionId, invoiceId: invoice.id },
      'API subscription payment failed'
    );

    // TODO: Send payment failed email notification
  } catch (error) {
    logger.error({ error, subscriptionId }, 'Error handling payment failed');
  }
}
