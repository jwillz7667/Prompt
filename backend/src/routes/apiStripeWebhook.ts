/**
 * API Stripe Webhook Handler
 *
 * Handles Stripe webhook events for API subscriptions.
 * Separate from the main app subscription webhooks.
 */

import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { logger } from '../utils/logger.js';
import {
  updateApiSubscription,
  resetPeriodUsage,
  getCreditPackById,
  API_TIER_CONFIG,
  ApiTier,
} from '../services/apiSubscriptionService.js';
import { sendApiPaymentFailed } from '../services/emailService.js';
import { ApiSubscriptionStatus, IdempotencyStatus, type Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { cache } from '../utils/redis.js';
import {
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
} from '../services/stripeBillingPayloads.js';

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
  const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;
  if (!tier) throw new Error('Unknown Stripe API subscription price');
  return tier;
}

async function beginWebhookProcessing(event: Stripe.Event): Promise<'process' | 'skip' | 'busy'> {
  const idempotencyKey = `api-stripe:${event.id}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`;
    const existing = await tx.webhookIdempotencyKey.findUnique({ where: { idempotencyKey } });
    if (existing?.status === IdempotencyStatus.COMPLETED) return 'skip';
    if (existing?.status === IdempotencyStatus.PROCESSING && existing.expiresAt > new Date())
      return 'busy';
    const data = {
      status: IdempotencyStatus.PROCESSING,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
    await tx.webhookIdempotencyKey.upsert({
      where: { idempotencyKey },
      update: data,
      create: {
        idempotencyKey,
        endpoint: '/api/v1/webhooks/api-stripe',
        payload: { eventId: event.id, type: event.type },
        ...data,
      },
    });
    return 'process';
  });
}

async function completeWebhookProcessing(event: Stripe.Event): Promise<void> {
  await prisma.webhookIdempotencyKey.update({
    where: { idempotencyKey: `api-stripe:${event.id}` },
    data: {
      status: IdempotencyStatus.COMPLETED,
      statusCode: 200,
      responseBody: { received: true } as Prisma.InputJsonValue,
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
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
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    logger.error({ err }, 'Stripe webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Received API Stripe webhook');

  try {
    const idempotencyState = await beginWebhookProcessing(event);

    if (idempotencyState === 'busy') {
      res.status(503).json({ error: 'Webhook is being processed. Retry later.' });
      return;
    }
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
        await handleSubscriptionUpdate(
          await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id),
        );
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
    await failWebhookProcessing(event).catch((failure) =>
      logger.error({ failure }, 'Failed to release webhook claim'),
    );
    logger.error({ error, eventType: event.type }, 'Error processing webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata || {};
  const userId = await resolveDeveloperId(subscription);

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
  const tier = getTierFromPriceId(priceId);

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

  const { start: periodStart, end: periodEnd } = getSubscriptionPeriod(subscription);

  await updateApiSubscription(userId, {
    tier,
    status,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId:
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripePriceId: priceId,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  logger.info(
    { userId, tier, status, subscriptionId: subscription.id },
    'API subscription updated',
  );
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata || {};
  const developerId = metadata['developerId'];
  if (
    !developerId ||
    metadata['type'] !== 'api_credit_purchase' ||
    session.mode !== 'payment' ||
    session.payment_status !== 'paid'
  )
    return;
  const pack = getCreditPackById(metadata['creditPackId'] || '');
  if (
    !pack ||
    metadata['credits'] !== String(pack.credits) ||
    session.currency !== 'usd' ||
    session.amount_total !== pack.priceCents
  ) {
    throw new Error('API credit checkout does not match the configured credit pack');
  }
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId) throw new Error('API credit checkout is missing its customer');
  const fulfillmentKey = `api-credit-session:${session.id}`;
  // Credit changes and fulfillment must commit together, even across distinct
  // checkout completion events or a crash immediately after the balance write.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`api-subscription:${developerId}`}, 0))`;
    const fulfilled = await tx.webhookIdempotencyKey.findUnique({
      where: { idempotencyKey: fulfillmentKey },
    });
    if (fulfilled?.status === IdempotencyStatus.COMPLETED) return;
    const subscription = await tx.apiSubscription.findUnique({ where: { developerId } });
    if (subscription?.stripeCustomerId && subscription.stripeCustomerId !== customerId) {
      throw new Error('API credit checkout customer does not match developer');
    }
    await tx.apiSubscription.upsert({
      where: { developerId },
      update: {
        stripeCustomerId: customerId,
        includedRequests: subscription?.includedRequests === -1 ? -1 : { increment: pack.credits },
      },
      create: {
        developerId,
        tier: ApiTier.API_FREE,
        status: ApiSubscriptionStatus.ACTIVE,
        stripeCustomerId: customerId,
        includedRequests: API_TIER_CONFIG.API_FREE.monthlyRequests + pack.credits,
        overageRateCents: 0,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        currentPeriodUsage: 0,
      },
    });
    const record = {
      status: IdempotencyStatus.COMPLETED,
      completedAt: new Date(),
      expiresAt: new Date('9999-12-31T00:00:00Z'),
      statusCode: 200,
      responseBody: { credits: pack.credits },
    };
    await tx.webhookIdempotencyKey.upsert({
      where: { idempotencyKey: fulfillmentKey },
      update: record,
      create: {
        idempotencyKey: fulfillmentKey,
        endpoint: '/api/v1/webhooks/api-stripe/credits',
        payload: { sessionId: session.id, developerId },
        ...record,
      },
    });
  });
  await cache.del(`api-subscription:${developerId}`);
}

async function resolveDeveloperId(subscription: Stripe.Subscription): Promise<string | undefined> {
  if (subscription.metadata['type'] !== 'api_subscription') return undefined;
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const existing = await prisma.apiSubscription.findFirst({
    where: {
      OR: [{ stripeSubscriptionId: subscription.id }, { stripeCustomerId: customerId }],
    },
  });
  // Checkout writes developerId. userId supports existing legacy subscriptions.
  const metadataId = subscription.metadata['developerId'] || subscription.metadata['userId'];
  if (existing && metadataId && existing.developerId !== metadataId)
    throw new Error('Stripe subscription owner mismatch');
  return existing?.developerId || metadataId;
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata || {};
  const userId = await resolveDeveloperId(subscription);

  if (!userId) {
    logger.warn({ subscriptionId: subscription.id }, 'No userId in subscription metadata');
    return;
  }

  if (metadata['type'] !== 'api_subscription') {
    return;
  }

  const current = await prisma.apiSubscription.findUnique({ where: { developerId: userId } });
  if (current?.stripeSubscriptionId !== subscription.id) return;
  // Downgrade to free tier
  await updateApiSubscription(userId, {
    tier: ApiTier.API_FREE,
    status: ApiSubscriptionStatus.CANCELED,
    stripeSubscriptionId: null,
    stripePriceId: null,
    cancelAtPeriodEnd: false,
  });

  logger.info({ userId, subscriptionId: subscription.id }, 'API subscription canceled');
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!stripe) throw new Error('Stripe is not configured');
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return;
  }

  // Get subscription to find userId
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const metadata = subscription.metadata || {};
    const userId = await resolveDeveloperId(subscription);

    if (!userId || metadata['type'] !== 'api_subscription') {
      return;
    }

    const { start: periodStart, end: periodEnd } = getSubscriptionPeriod(subscription);

    // Reset period usage on successful payment (new billing cycle)
    if (invoice.billing_reason === 'subscription_cycle') {
      await resetPeriodUsage(userId, periodStart, periodEnd);

      logger.info(
        { userId, subscriptionId, periodStart, periodEnd },
        'API subscription period reset after payment',
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
    throw error;
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  if (!stripe) throw new Error('Stripe is not configured');
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const metadata = subscription.metadata || {};
    const userId = await resolveDeveloperId(subscription);

    if (!userId || metadata['type'] !== 'api_subscription') {
      return;
    }

    if (subscription.status !== 'past_due' && subscription.status !== 'unpaid') return;
    // Mark subscription as past due
    await updateApiSubscription(userId, {
      tier: getTierFromPriceId(subscription.items.data[0]?.price.id || ''),
      status: ApiSubscriptionStatus.PAST_DUE,
    });

    logger.warn(
      { userId, subscriptionId, invoiceId: invoice.id },
      'API subscription payment failed',
    );

    // Send payment failed email notification
    const developer = await prisma.developer.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (developer) {
      sendApiPaymentFailed(
        developer.email,
        developer.name,
        getTierFromPriceId(subscription.items.data[0]?.price.id || ''),
      ).catch((err) => logger.error({ err }, 'Failed to send payment failed email'));
    }
  } catch (error) {
    logger.error({ error, subscriptionId }, 'Error handling payment failed');
    throw error;
  }
}
