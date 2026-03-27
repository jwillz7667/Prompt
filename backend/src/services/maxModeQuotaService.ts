import { SubscriptionTier } from '@prisma/client';

export interface MaxModeQuotaInfo {
  usedToday: number;
  dailyLimit: number;
  remaining: number;
  isUnlimited: boolean;
}

const FREE_ALLOWED_MODALITIES = new Set(['text']);

export async function getMaxModeQuota(_userId: string, tier: SubscriptionTier): Promise<MaxModeQuotaInfo> {
  if (tier !== SubscriptionTier.FREE) {
    return {
      usedToday: 0,
      dailyLimit: -1,
      remaining: Number.MAX_SAFE_INTEGER,
      isUnlimited: true,
    };
  }

  // Free users have no MAX mode access
  return {
    usedToday: 0,
    dailyLimit: 0,
    remaining: 0,
    isUnlimited: false,
  };
}

export async function ensureMaxModeAvailable(_userId: string, tier: SubscriptionTier): Promise<MaxModeQuotaInfo> {
  if (tier === SubscriptionTier.FREE) {
    throw new Error('FREE_MAX_MODE_LIMIT_REACHED');
  }

  return getMaxModeQuota(_userId, tier);
}

export async function recordMaxModeUsage(userId: string, tier: SubscriptionTier): Promise<MaxModeQuotaInfo> {
  // No tracking needed — free users are fully blocked, subscribers are unlimited
  return getMaxModeQuota(userId, tier);
}

export function ensureModalityAvailable(modality: string | undefined, tier: SubscriptionTier): void {
  if (tier === SubscriptionTier.FREE && modality && !FREE_ALLOWED_MODALITIES.has(modality)) {
    throw new Error('MODALITY_REQUIRES_SUBSCRIPTION');
  }
}
