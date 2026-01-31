/**
 * API Subscription Service
 *
 * Manages Enterprise API subscriptions, tiers, and Stripe billing integration.
 */

import Stripe from 'stripe';
import { prisma } from '../utils/prisma.js';
import { cache } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { ApiTier, ApiSubscriptionStatus } from '@prisma/client';
import type { ApiSubscription } from '@prisma/client';

// Re-export for convenience
export { ApiTier, ApiSubscriptionStatus };

// ============================================================================
// STRIPE CONFIGURATION
// ============================================================================

// Initialize Stripe only if API key is configured
const stripeApiKey = process.env['STRIPE_API_SECRET_KEY'];
const stripe = stripeApiKey ? new Stripe(stripeApiKey) : null;

// Stripe Price IDs (set in environment)
const PRICE_IDS = {
  API_STARTER: process.env['STRIPE_API_STARTER_PRICE_ID'] || '',
  API_PRO: process.env['STRIPE_API_PRO_PRICE_ID'] || '',
  API_OVERAGE: process.env['STRIPE_API_OVERAGE_PRICE_ID'] || '',
};

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

export interface ApiTierConfig {
  tier: ApiTier;
  name: string;
  description: string;
  monthlyRequests: number; // -1 for unlimited
  requestsPerMinute: number;
  priceMonthly: number;
  overagePerHundred: number; // cents per 100 requests
  features: string[];
}

export const API_TIER_CONFIG: Record<ApiTier, ApiTierConfig> = {
  API_FREE: {
    tier: ApiTier.API_FREE,
    name: 'Free',
    description: 'Perfect for testing and development',
    monthlyRequests: 100,
    requestsPerMinute: 10,
    priceMonthly: 0,
    overagePerHundred: 0, // No overage allowed
    features: [
      '100 requests/month',
      '10 requests/minute',
      'Basic support',
      'Community access',
    ],
  },
  API_STARTER: {
    tier: ApiTier.API_STARTER,
    name: 'Starter',
    description: 'For small projects and startups',
    monthlyRequests: 1000,
    requestsPerMinute: 60,
    priceMonthly: 2900, // $29
    overagePerHundred: 1, // $0.01 per 100
    features: [
      '1,000 requests/month',
      '60 requests/minute',
      'Email support',
      'Usage analytics',
      'Pay-as-you-go overage',
    ],
  },
  API_PRO: {
    tier: ApiTier.API_PRO,
    name: 'Pro',
    description: 'For growing businesses',
    monthlyRequests: 10000,
    requestsPerMinute: 100,
    priceMonthly: 9900, // $99
    overagePerHundred: 1, // $0.01 per 100
    features: [
      '10,000 requests/month',
      '100 requests/minute',
      'Priority support',
      'Advanced analytics',
      'Pay-as-you-go overage',
      'SLA guarantee',
    ],
  },
  API_ENTERPRISE: {
    tier: ApiTier.API_ENTERPRISE,
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
    monthlyRequests: -1, // Unlimited
    requestsPerMinute: 1000,
    priceMonthly: 0, // Custom pricing
    overagePerHundred: 0, // Included
    features: [
      'Unlimited requests',
      'Custom rate limits',
      'Dedicated support',
      'Custom SLA',
      'On-premise options',
      'SSO/SAML',
    ],
  },
};

// ============================================================================
// TYPES
// ============================================================================

export interface ApiSubscriptionInfo {
  tier: ApiTier;
  status: ApiSubscriptionStatus;
  monthlyRequestLimit: number;
  requestsPerMinute: number;
  currentPeriodUsage: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  remainingRequests: number;
  canMakeRequests: boolean;
  overageAllowed: boolean;
  features: string[];
}

interface ApiSubscriptionCache {
  tier: string;
  status: string;
  monthlyLimit: number;
  rateLimit: number;
  periodUsage: number;
  periodStart: string;
  periodEnd: string;
}

// ============================================================================
// SUBSCRIPTION INFO
// ============================================================================

/**
 * Get API subscription info for a user.
 */
export async function getApiSubscriptionInfo(developerId: string): Promise<ApiSubscriptionInfo> {
  // Try cache first
  const cached = await cache.get<ApiSubscriptionCache>(`api-subscription:${developerId}`);
  if (cached) {
    const config = API_TIER_CONFIG[cached.tier as ApiTier];
    const remainingRequests = config.monthlyRequests === -1
      ? -1
      : Math.max(0, config.monthlyRequests - cached.periodUsage);

    return {
      tier: cached.tier as ApiTier,
      status: cached.status as ApiSubscriptionStatus,
      monthlyRequestLimit: config.monthlyRequests,
      requestsPerMinute: config.requestsPerMinute,
      currentPeriodUsage: cached.periodUsage,
      currentPeriodStart: new Date(cached.periodStart),
      currentPeriodEnd: new Date(cached.periodEnd),
      remainingRequests,
      canMakeRequests: remainingRequests === -1 || remainingRequests > 0 || config.overagePerHundred > 0,
      overageAllowed: config.overagePerHundred > 0,
      features: config.features,
    };
  }

  // Cache miss - query database
  let subscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  // Create default free subscription if none exists
  if (!subscription) {
    subscription = await ensureApiSubscription(developerId);
  }

  const config = API_TIER_CONFIG[subscription.tier];
  const remainingRequests = config.monthlyRequests === -1
    ? -1
    : Math.max(0, config.monthlyRequests - subscription.currentPeriodUsage);

  // Cache the result
  await cache.set(`api-subscription:${developerId}`, {
    tier: subscription.tier,
    status: subscription.status,
    monthlyLimit: config.monthlyRequests,
    rateLimit: config.requestsPerMinute,
    periodUsage: subscription.currentPeriodUsage,
    periodStart: subscription.currentPeriodStart.toISOString(),
    periodEnd: subscription.currentPeriodEnd.toISOString(),
  }, 60); // 1 minute cache

  return {
    tier: subscription.tier,
    status: subscription.status,
    monthlyRequestLimit: config.monthlyRequests,
    requestsPerMinute: config.requestsPerMinute,
    currentPeriodUsage: subscription.currentPeriodUsage,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    remainingRequests,
    canMakeRequests: remainingRequests === -1 || remainingRequests > 0 || config.overagePerHundred > 0,
    overageAllowed: config.overagePerHundred > 0,
    features: config.features,
  };
}

/**
 * Check if user can make an API request.
 */
export async function canMakeRequest(developerId: string): Promise<{
  allowed: boolean;
  reason?: string;
  remainingRequests?: number;
}> {
  const info = await getApiSubscriptionInfo(developerId);

  if (info.status !== ApiSubscriptionStatus.ACTIVE) {
    return {
      allowed: false,
      reason: `API subscription is ${info.status.toLowerCase()}`,
    };
  }

  if (!info.canMakeRequests) {
    return {
      allowed: false,
      reason: 'Monthly quota exceeded',
      remainingRequests: 0,
    };
  }

  return {
    allowed: true,
    remainingRequests: info.remainingRequests,
  };
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Ensure a user has an API subscription (create if needed).
 */
export async function ensureApiSubscription(developerId: string): Promise<ApiSubscription> {
  const existing = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  if (existing) {
    return existing;
  }

  // Create default free subscription
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  return prisma.apiSubscription.create({
    data: {
      developerId,
      tier: ApiTier.API_FREE,
      status: ApiSubscriptionStatus.ACTIVE,
      includedRequests: API_TIER_CONFIG.API_FREE.monthlyRequests,
      overageRateCents: 0,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      currentPeriodUsage: 0,
    },
  });
}

/**
 * Update subscription tier (used by webhooks).
 */
export async function updateApiSubscription(
  developerId: string,
  data: {
    tier: ApiTier;
    status: ApiSubscriptionStatus;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    stripePriceId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
  }
): Promise<ApiSubscription> {
  const config = API_TIER_CONFIG[data.tier];

  const subscription = await prisma.apiSubscription.upsert({
    where: { developerId },
    update: {
      tier: data.tier,
      status: data.status,
      stripeSubscriptionId: data.stripeSubscriptionId,
      stripeCustomerId: data.stripeCustomerId,
      stripePriceId: data.stripePriceId,
      includedRequests: config.monthlyRequests,
      overageRateCents: config.overagePerHundred,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    },
    create: {
      developerId,
      tier: data.tier,
      status: data.status,
      stripeSubscriptionId: data.stripeSubscriptionId,
      stripeCustomerId: data.stripeCustomerId,
      stripePriceId: data.stripePriceId,
      includedRequests: config.monthlyRequests,
      overageRateCents: config.overagePerHundred,
      currentPeriodStart: data.currentPeriodStart || new Date(),
      currentPeriodEnd: data.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // Invalidate cache
  await cache.del(`api-subscription:${developerId}`);

  logger.info({ developerId, tier: data.tier, status: data.status }, 'API subscription updated');

  return subscription;
}

/**
 * Reset period usage (called on billing cycle renewal).
 */
export async function resetPeriodUsage(
  developerId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<void> {
  await prisma.apiSubscription.update({
    where: { developerId },
    data: {
      currentPeriodUsage: 0,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });

  await cache.del(`api-subscription:${developerId}`);

  logger.info({ developerId, periodStart, periodEnd }, 'API subscription period reset');
}

/**
 * Cancel subscription at period end.
 */
export async function cancelApiSubscription(developerId: string): Promise<void> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  if (subscription?.stripeSubscriptionId && stripe) {
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  await prisma.apiSubscription.update({
    where: { developerId },
    data: {
      cancelAtPeriodEnd: true,
    },
  });

  await cache.del(`api-subscription:${developerId}`);

  logger.info({ developerId }, 'API subscription scheduled for cancellation');
}

// ============================================================================
// STRIPE CHECKOUT
// ============================================================================

/**
 * Create a Stripe checkout session for API subscription.
 */
export async function createCheckoutSession(
  developerId: string,
  email: string,
  tier: 'API_STARTER' | 'API_PRO',
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_API_SECRET_KEY.');
  }

  const priceId = PRICE_IDS[tier];

  if (!priceId) {
    throw new Error(`Price ID not configured for tier: ${tier}`);
  }

  // Get or create Stripe customer
  let stripeCustomerId: string | undefined;

  const existingSubscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  if (existingSubscription?.stripeCustomerId) {
    stripeCustomerId = existingSubscription.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email,
      metadata: { developerId },
    });
    stripeCustomerId = customer.id;
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      developerId,
      tier,
      type: 'api_subscription',
    },
    subscription_data: {
      metadata: {
        developerId,
        tier,
        type: 'api_subscription',
      },
    },
  });

  if (!session.url) {
    throw new Error('Failed to create checkout session');
  }

  logger.info({ developerId, tier, sessionId: session.id }, 'API checkout session created');

  return { url: session.url };
}

/**
 * Create a Stripe billing portal session.
 */
export async function createPortalSession(
  developerId: string,
  returnUrl: string
): Promise<{ url: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_API_SECRET_KEY.');
  }

  const subscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  if (!subscription?.stripeCustomerId) {
    throw new Error('No Stripe customer found');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

// ============================================================================
// INVOICE HISTORY
// ============================================================================

/**
 * Get invoice history from Stripe.
 */
export async function getInvoices(
  developerId: string,
  limit: number = 10
): Promise<{
  invoices: Array<{
    id: string;
    number: string | null;
    amountDue: number;
    amountPaid: number;
    status: string | null;
    created: Date;
    pdfUrl: string | null;
  }>;
}> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  if (!subscription?.stripeCustomerId || !stripe) {
    return { invoices: [] };
  }

  const invoices = await stripe.invoices.list({
    customer: subscription.stripeCustomerId,
    limit,
  });

  return {
    invoices: invoices.data.map((invoice: Stripe.Invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      status: invoice.status as string | null,
      created: new Date(invoice.created * 1000),
      pdfUrl: invoice.invoice_pdf ?? null,
    })),
  };
}

// ============================================================================
// METERED BILLING (for overages)
// ============================================================================

/**
 * Report usage to Stripe for metered billing.
 */
export async function reportUsageToStripe(
  developerId: string,
  quantity: number
): Promise<void> {
  if (!stripe) {
    return; // Stripe not configured
  }

  const subscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  if (!subscription?.stripeSubscriptionId) {
    return;
  }

  // Only report overage for paid tiers
  if (subscription.tier === ApiTier.API_FREE) {
    return;
  }

  const config = API_TIER_CONFIG[subscription.tier];
  if (config.overagePerHundred <= 0) {
    return;
  }

  try {
    // Get the metered subscription item
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    const meteredItem = stripeSubscription.items.data.find(
      (item: Stripe.SubscriptionItem) => item.price.id === PRICE_IDS.API_OVERAGE
    );

    if (meteredItem) {
      // Use Stripe's billing meter API for usage-based billing
      // For older Stripe versions, createUsageRecord was on subscriptionItems
      // For newer versions, use billing.meterEvents or the REST API directly
      await stripe.billing.meterEvents.create({
        event_name: 'api_requests',
        payload: {
          stripe_customer_id: subscription.stripeCustomerId || '',
          value: quantity.toString(),
        },
      });

      logger.debug({ developerId, quantity }, 'Reported usage to Stripe');
    }
  } catch (error) {
    // Metered billing may not be configured - log but don't fail
    logger.warn({ error, developerId, quantity }, 'Failed to report usage to Stripe (metered billing may not be configured)');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get available API plans for display.
 */
export function getAvailablePlans(): ApiTierConfig[] {
  return [
    API_TIER_CONFIG.API_FREE,
    API_TIER_CONFIG.API_STARTER,
    API_TIER_CONFIG.API_PRO,
    API_TIER_CONFIG.API_ENTERPRISE,
  ];
}

/**
 * Get tier config by tier name.
 */
export function getTierConfig(tier: ApiTier): ApiTierConfig {
  return API_TIER_CONFIG[tier];
}
