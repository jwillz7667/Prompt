import { prisma } from '../utils/prisma.js';
import { SubscriptionTier, SubscriptionStatus, Prisma } from '@prisma/client';
import { cache } from '../utils/redis.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  dailyPromptsUsed: number;
  dailyPromptsLimit: number; // -1 = unlimited
  canPerformAction: boolean;
  features: TierFeatures;
}

export interface TierFeatures {
  promptQuality: 'basic' | 'standard' | 'advanced';
  canExport: boolean;
  canUseBatchMode: boolean;
  maxTokensPerPrompt: number;
}

export interface TierLimits {
  dailyPrompts: number; // -1 = unlimited
  promptQuality: 'basic' | 'standard' | 'advanced';
  canExport: boolean;
  canUseBatchMode: boolean;
  maxTokensPerPrompt: number;
}

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    dailyPrompts: 10,
    promptQuality: 'basic',
    canExport: false,
    canUseBatchMode: false,
    maxTokensPerPrompt: 4096,
  },
  PRO: {
    dailyPrompts: 100,
    promptQuality: 'standard',
    canExport: true,
    canUseBatchMode: false,
    maxTokensPerPrompt: 8192,
  },
  PREMIUM: {
    dailyPrompts: -1, // Unlimited
    promptQuality: 'advanced',
    canExport: true,
    canUseBatchMode: true,
    maxTokensPerPrompt: 8192, // DeepSeek API limit
  },
};

const PRODUCT_ID_TO_TIER: Record<string, SubscriptionTier> = {
  'com.promptomizer.pro.monthly': SubscriptionTier.PRO,
  'com.promptomizer.pro.annual': SubscriptionTier.PRO,
  'com.promptomizer.premium.monthly': SubscriptionTier.PREMIUM,
  'com.promptomizer.premium.annual': SubscriptionTier.PREMIUM,
};

const FREE_TRIAL_DAYS = parseInt(process.env['FREE_TRIAL_DAYS'] || '7', 10);

// ============================================================================
// SUBSCRIPTION INFO
// ============================================================================

export async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
  // Get today's date key for cache
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateKey = today.toISOString().split('T')[0];

  // Try to get cached subscription info
  const cachedSub = await cache.getSubscription(userId);
  const cachedUsage = await cache.getDailyUsage(userId, dateKey);

  let subscription;
  let dailyUsage;

  if (cachedSub && cachedUsage) {
    // Use cached data (fast path)
    logger.debug({ userId }, 'Subscription cache hit');
    const limits = TIER_LIMITS[cachedSub.tier as SubscriptionTier];
    return {
      tier: cachedSub.tier as SubscriptionTier,
      status: cachedSub.status as SubscriptionStatus,
      expiresAt: cachedSub.expiresAt ? new Date(cachedSub.expiresAt) : null,
      isTrialing: false,
      trialEndsAt: null,
      dailyPromptsUsed: cachedUsage.promptCount,
      dailyPromptsLimit: limits.dailyPrompts,
      canPerformAction: limits.dailyPrompts === -1 || cachedUsage.promptCount < limits.dailyPrompts,
      features: {
        promptQuality: limits.promptQuality,
        canExport: limits.canExport,
        canUseBatchMode: limits.canUseBatchMode,
        maxTokensPerPrompt: limits.maxTokensPerPrompt,
      },
    };
  }

  // Cache miss - query database
  logger.debug({ userId }, 'Subscription cache miss - querying database');
  [subscription, dailyUsage] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId },
      include: { user: true },
    }),
    getTodayUsage(userId),
  ]);

  // Get the effective tier (from subscription or default FREE)
  let effectiveTier: SubscriptionTier = SubscriptionTier.FREE;
  let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
  let isTrialing = false;
  let expiresAt: Date | null = null;
  let trialEndsAt: Date | null = null;

  if (subscription) {
    effectiveTier = subscription.tier;
    status = subscription.status;
    isTrialing = subscription.isTrialing;
    expiresAt = subscription.expiresAt;
    trialEndsAt = subscription.trialEndDate;

    // Check if subscription has expired
    if (subscription.expiresAt && subscription.expiresAt < new Date()) {
      if (subscription.status !== SubscriptionStatus.EXPIRED) {
        await handleExpiredSubscription(subscription.id);
        effectiveTier = SubscriptionTier.FREE;
        status = SubscriptionStatus.EXPIRED;
      }
    }

    // Check if trial has ended
    if (subscription.isTrialing && subscription.trialEndDate && subscription.trialEndDate < new Date()) {
      await handleExpiredTrial(subscription.id);
      effectiveTier = SubscriptionTier.FREE;
      isTrialing = false;
    }
  }

  const limits = TIER_LIMITS[effectiveTier];
  const dailyPromptsUsed = dailyUsage?.promptCount || 0;
  const dailyPromptsLimit = limits.dailyPrompts;

  // Check if user can perform action (hasn't exceeded quota)
  const canPerformAction = dailyPromptsLimit === -1 || dailyPromptsUsed < dailyPromptsLimit;

  // Populate cache for future requests
  await cache.setSubscription(userId, {
    tier: effectiveTier,
    status,
    expiresAt: expiresAt?.toISOString() || null,
    dailyLimit: limits.dailyPrompts,
    maxTokens: limits.maxTokensPerPrompt,
    promptQuality: limits.promptQuality,
  });

  await cache.setDailyUsage(userId, dateKey, {
    promptCount: dailyPromptsUsed,
    date: dateKey,
  });

  return {
    tier: effectiveTier,
    status,
    expiresAt,
    isTrialing,
    trialEndsAt,
    dailyPromptsUsed,
    dailyPromptsLimit,
    canPerformAction,
    features: {
      promptQuality: limits.promptQuality,
      canExport: limits.canExport,
      canUseBatchMode: limits.canUseBatchMode,
      maxTokensPerPrompt: limits.maxTokensPerPrompt,
    },
  };
}

// ============================================================================
// QUOTA CHECKING
// ============================================================================

export type QuotaAction = 'enhance_prompt' | 'export' | 'batch_mode';

export async function canPerformAction(userId: string, action: QuotaAction): Promise<{
  allowed: boolean;
  reason?: string;
  remainingQuota?: number;
}> {
  const info = await getSubscriptionInfo(userId);

  switch (action) {
    case 'enhance_prompt': {
      if (info.dailyPromptsLimit === -1) {
        return { allowed: true };
      }
      if (info.dailyPromptsUsed >= info.dailyPromptsLimit) {
        return {
          allowed: false,
          reason: 'QUOTA_EXCEEDED',
          remainingQuota: 0,
        };
      }
      return {
        allowed: true,
        remainingQuota: info.dailyPromptsLimit - info.dailyPromptsUsed,
      };
    }

    case 'export': {
      if (!info.features.canExport) {
        return {
          allowed: false,
          reason: 'FEATURE_LOCKED',
        };
      }
      return { allowed: true };
    }

    case 'batch_mode': {
      if (!info.features.canUseBatchMode) {
        return {
          allowed: false,
          reason: 'FEATURE_LOCKED',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

async function getTodayUsage(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.dailyUsage.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });
}

export async function recordUsage(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateKey = today.toISOString().split('T')[0];

  await prisma.dailyUsage.upsert({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
    update: {
      promptCount: { increment: 1 },
    },
    create: {
      userId,
      date: today,
      promptCount: 1,
    },
  });

  // Invalidate daily usage cache so next request gets fresh data
  await cache.invalidateDailyUsage(userId, dateKey);
}

// ============================================================================
// FREE TRIAL
// ============================================================================

export async function startFreeTrial(userId: string): Promise<{
  success: boolean;
  message: string;
  trialEndDate?: Date;
}> {
  // Check if user already has a subscription or has used trial
  const existingSubscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (existingSubscription?.hasUsedTrial) {
    return {
      success: false,
      message: 'Trial already used',
    };
  }

  if (existingSubscription?.tier !== SubscriptionTier.FREE) {
    return {
      success: false,
      message: 'Already subscribed',
    };
  }

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + FREE_TRIAL_DAYS);

  if (existingSubscription) {
    // Update existing subscription to trial
    await prisma.subscription.update({
      where: { userId },
      data: {
        tier: SubscriptionTier.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
        isTrialing: true,
        hasUsedTrial: true,
        trialEndDate,
        expiresAt: trialEndDate,
      },
    });
  } else {
    // Create new subscription with trial
    await prisma.subscription.create({
      data: {
        userId,
        tier: SubscriptionTier.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
        isTrialing: true,
        hasUsedTrial: true,
        trialEndDate,
        expiresAt: trialEndDate,
      },
    });
  }

  // Update user's tier
  await prisma.user.update({
    where: { id: userId },
    data: { subscriptionTier: SubscriptionTier.PREMIUM },
  });

  // Invalidate subscription cache
  await cache.invalidateSubscription(userId);
  await cache.invalidateUser(userId);

  return {
    success: true,
    message: 'Trial started',
    trialEndDate,
  };
}

export async function hasUsedTrial(userId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { hasUsedTrial: true },
  });

  return subscription?.hasUsedTrial || false;
}

// ============================================================================
// SUBSCRIPTION UPDATES
// ============================================================================

export async function updateSubscription(
  userId: string,
  data: {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    productId: string;
    originalTransactionId: string;
    expiresAt: Date | null;
    autoRenewEnabled: boolean;
    autoRenewProductId?: string;
  }
): Promise<void> {
  const existingSubscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { userId },
      data: {
        tier: data.tier,
        status: data.status,
        productId: data.productId,
        originalTransactionId: data.originalTransactionId,
        expiresAt: data.expiresAt,
        autoRenewEnabled: data.autoRenewEnabled,
        autoRenewProductId: data.autoRenewProductId,
        isTrialing: false, // Clear trial flag when a real subscription is active
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        tier: data.tier,
        status: data.status,
        productId: data.productId,
        originalTransactionId: data.originalTransactionId,
        expiresAt: data.expiresAt,
        autoRenewEnabled: data.autoRenewEnabled,
        autoRenewProductId: data.autoRenewProductId,
      },
    });
  }

  // Update user's tier (denormalized for fast access)
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: data.tier,
      isPremium: data.tier !== SubscriptionTier.FREE,
    },
  });

  // Invalidate subscription cache
  await cache.invalidateSubscription(userId);
  await cache.invalidateUser(userId);
}

export async function cancelSubscription(userId: string): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: {
      status: SubscriptionStatus.CANCELED,
      autoRenewEnabled: false,
    },
  });

  // Invalidate subscription cache
  await cache.invalidateSubscription(userId);
}

export async function handleGracePeriod(
  userId: string,
  gracePeriodEndDate: Date
): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: {
      status: SubscriptionStatus.GRACE_PERIOD,
      gracePeriodEndDate,
    },
  });
}

// ============================================================================
// EXPIRATION HANDLING
// ============================================================================

async function handleExpiredSubscription(subscriptionId: string): Promise<void> {
  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      tier: SubscriptionTier.FREE,
      status: SubscriptionStatus.EXPIRED,
    },
    include: { user: true },
  });

  // Update user's tier
  await prisma.user.update({
    where: { id: subscription.userId },
    data: {
      subscriptionTier: SubscriptionTier.FREE,
      isPremium: false,
    },
  });
}

async function handleExpiredTrial(subscriptionId: string): Promise<void> {
  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      tier: SubscriptionTier.FREE,
      status: SubscriptionStatus.EXPIRED,
      isTrialing: false,
    },
    include: { user: true },
  });

  // Update user's tier
  await prisma.user.update({
    where: { id: subscription.userId },
    data: {
      subscriptionTier: SubscriptionTier.FREE,
      isPremium: false,
    },
  });
}

// Cron job function to process expired subscriptions
export async function processExpiredSubscriptions(): Promise<number> {
  const now = new Date();

  // Find all expired subscriptions that haven't been processed
  const expiredSubscriptions = await prisma.subscription.findMany({
    where: {
      OR: [
        {
          status: SubscriptionStatus.ACTIVE,
          expiresAt: { lt: now },
          isTrialing: false,
        },
        {
          status: SubscriptionStatus.ACTIVE,
          isTrialing: true,
          trialEndDate: { lt: now },
        },
        {
          status: SubscriptionStatus.GRACE_PERIOD,
          gracePeriodEndDate: { lt: now },
        },
      ],
    },
  });

  for (const subscription of expiredSubscriptions) {
    if (subscription.isTrialing) {
      await handleExpiredTrial(subscription.id);
    } else {
      await handleExpiredSubscription(subscription.id);
    }
  }

  return expiredSubscriptions.length;
}

// ============================================================================
// HELPERS
// ============================================================================

export function getTierFromProductId(productId: string): SubscriptionTier {
  return PRODUCT_ID_TO_TIER[productId] || SubscriptionTier.FREE;
}

export function getTierLimits(tier: SubscriptionTier): TierLimits {
  return TIER_LIMITS[tier];
}

export async function ensureSubscriptionExists(userId: string): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!existing) {
    await prisma.subscription.create({
      data: {
        userId,
        tier: SubscriptionTier.FREE,
        status: SubscriptionStatus.ACTIVE,
      },
    });
  }
}

// Get available products for display
export function getAvailableProducts() {
  return [
    {
      productId: 'com.promptomizer.pro.monthly',
      tier: 'PRO',
      name: 'Pro Monthly',
      price: 4.99,
      period: 'month',
      features: TIER_LIMITS.PRO,
    },
    {
      productId: 'com.promptomizer.pro.annual',
      tier: 'PRO',
      name: 'Pro Annual',
      price: 49.99,
      period: 'year',
      savings: '2 months free',
      features: TIER_LIMITS.PRO,
    },
    {
      productId: 'com.promptomizer.premium.monthly',
      tier: 'PREMIUM',
      name: 'Premium Monthly',
      price: 9.99,
      period: 'month',
      hasTrial: true,
      features: TIER_LIMITS.PREMIUM,
    },
    {
      productId: 'com.promptomizer.premium.annual',
      tier: 'PREMIUM',
      name: 'Premium Annual',
      price: 99.99,
      period: 'year',
      savings: '2 months free',
      hasTrial: true,
      features: TIER_LIMITS.PREMIUM,
    },
  ];
}
