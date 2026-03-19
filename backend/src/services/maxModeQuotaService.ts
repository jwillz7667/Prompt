import { SubscriptionTier } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

export interface MaxModeQuotaInfo {
  usedToday: number;
  dailyLimit: number;
  remaining: number;
  isUnlimited: boolean;
}

const FREE_MAX_MODE_DAILY_LIMIT = 5;
const MAX_MODE_AUDIT_ACTION = 'max_mode_prompt_used';

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export async function getMaxModeQuota(userId: string, tier: SubscriptionTier): Promise<MaxModeQuotaInfo> {
  if (tier !== SubscriptionTier.FREE) {
    return {
      usedToday: 0,
      dailyLimit: -1,
      remaining: Number.MAX_SAFE_INTEGER,
      isUnlimited: true,
    };
  }

  const usedToday = await prisma.auditLog.count({
    where: {
      userId,
      action: MAX_MODE_AUDIT_ACTION,
      createdAt: {
        gte: startOfToday(),
      },
    },
  });

  return {
    usedToday,
    dailyLimit: FREE_MAX_MODE_DAILY_LIMIT,
    remaining: Math.max(0, FREE_MAX_MODE_DAILY_LIMIT - usedToday),
    isUnlimited: false,
  };
}

export async function ensureMaxModeAvailable(userId: string, tier: SubscriptionTier): Promise<MaxModeQuotaInfo> {
  const quota = await getMaxModeQuota(userId, tier);

  if (!quota.isUnlimited && quota.remaining <= 0) {
    throw new Error('FREE_MAX_MODE_LIMIT_REACHED');
  }

  return quota;
}

export async function recordMaxModeUsage(userId: string, tier: SubscriptionTier): Promise<MaxModeQuotaInfo> {
  if (tier !== SubscriptionTier.FREE) {
    return getMaxModeQuota(userId, tier);
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: MAX_MODE_AUDIT_ACTION,
      resource: 'prompt',
      metadata: {
        recordedAt: new Date().toISOString(),
      },
    },
  });

  return getMaxModeQuota(userId, tier);
}
