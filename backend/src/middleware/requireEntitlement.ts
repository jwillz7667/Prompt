/**
 * Hard paywall gate for every route that can reach an LLM, embedding, or
 * vision provider.
 *
 * Order on a route: authenticate -> requireEntitlement -> handler. It must run
 * before any SSE headers are written so a denial is a real HTTP status:
 *   - not entitled: 403 {error:'Subscription required', code:'QUOTA_EXCEEDED',
 *     reason:'SUBSCRIPTION_REQUIRED', remainingQuota:0}. Shipped iOS builds open
 *     the paywall on 403 QUOTA_EXCEEDED, so the code must not change.
 *   - entitled but over the daily fair-use ceiling: 429 {code:'FAIR_USE_LIMIT', resetAt}.
 * getSubscriptionInfo runs exactly once; its result is attached as
 * req.subscription (legacy flat shape declared in types/express.d.ts) and the
 * full SubscriptionInfo is available to handlers through getEntitlement(req).
 *
 * This gate only reads today's count (an early, cheap rejection). Generating
 * handlers then reserve each provider call atomically with reserveGenerations
 * before the call and release the unit only when nothing was delivered, which
 * closes the read-then-charge race and charges clients that disconnect after
 * receiving output. Routes that do not reach a provider never reserve.
 *
 * Feature flag HARD_PAYWALL_ENABLED (default true, validated at boot in
 * subscriptionService):
 *   Rollout: ships enabled together with the iOS hard paywall. Setting it to
 *   "false" in Railway restores the legacy free allowance
 *   (FREE_DAILY_PROMPT_LIMIT per UTC day, default 10) on the next restart,
 *   without a code deploy, if conversion or App Review forces a rollback.
 *   Cleanup: once the paywall build has been live for one full release with
 *   the flag untouched, delete the flag, the legacy-allowance branch below and
 *   FREE_DAILY_PROMPT_LIMIT, and drop the PRO enum value in the same release.
 */
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import {
  entitlementConfig,
  generationDailyLimit,
  getSubscriptionInfo,
  type SubscriptionInfo,
} from '../services/subscriptionService.js';
import { sendDailyLimitReached } from '../services/emailService.js';
import { prisma } from '../utils/prisma.js';
import { subscriptionLogger } from '../utils/logger.js';

/** SubscriptionInfo plus the flat fields older handlers read off req.subscription. */
export type RequestSubscription = SubscriptionInfo & {
  promptQuality: SubscriptionInfo['features']['promptQuality'];
  canExport: boolean;
  maxTokensPerPrompt: number;
};

export type EntitledRequest = AuthenticatedRequest;

// Request-scoped: entries die with their request object. Used because the
// global Express.Request.subscription type predates SubscriptionInfo.
const entitlementsByRequest = new WeakMap<Request, SubscriptionInfo>();

/** The SubscriptionInfo requireEntitlement resolved for this request. */
export function getEntitlement(req: Request): SubscriptionInfo | undefined {
  return entitlementsByRequest.get(req);
}

export const SUBSCRIPTION_REQUIRED_BODY = {
  error: 'Subscription required',
  code: 'QUOTA_EXCEEDED',
  reason: 'SUBSCRIPTION_REQUIRED',
  remainingQuota: 0,
} as const;

function nextUtcMidnight(now: Date = new Date()): Date {
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

/**
 * The response for a request whose daily allowance is spent: 429 FAIR_USE_LIMIT
 * for subscribers, the legacy 403 QUOTA_EXCEEDED body while the hard paywall
 * is disabled. Must be sent before any SSE header.
 */
export function sendUsageLimitResponse(
  res: Response,
  info: Pick<SubscriptionInfo, 'isEntitled'>,
  resetAt: Date = nextUtcMidnight(),
): void {
  if (!info.isEntitled) {
    res.status(403).json(
      entitlementConfig.isHardPaywallEnabled
        ? SUBSCRIPTION_REQUIRED_BODY
        : {
            error: 'Quota exceeded',
            code: 'QUOTA_EXCEEDED',
            reason: 'DAILY_LIMIT_REACHED',
            remainingQuota: 0,
          },
    );
    return;
  }
  res.status(429).json({
    error: 'Daily fair-use limit reached',
    code: 'FAIR_USE_LIMIT',
    resetAt: resetAt.toISOString(),
  });
}

function toRequestSubscription(info: SubscriptionInfo): RequestSubscription {
  return {
    ...info,
    promptQuality: info.features.promptQuality,
    canExport: info.features.canExport,
    maxTokensPerPrompt: info.features.maxTokensPerPrompt,
  };
}

function notifyLegacyLimitReached(userId: string, info: SubscriptionInfo): void {
  // Only the request that lands exactly on the limit sends the email.
  if (info.dailyPromptsUsed !== info.dailyPromptsLimit) return;
  void prisma.user
    .findUnique({ where: { id: userId }, select: { email: true, name: true } })
    .then((user) =>
      user
        ? sendDailyLimitReached(user.email, user.name, info.tier, info.dailyPromptsLimit)
        : undefined,
    )
    .catch((error: unknown) => {
      subscriptionLogger.warn({ err: error, userId }, 'Failed to send daily limit email');
    });
}

export async function requireEntitlement(
  req: EntitledRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated', code: 'TOKEN_MISSING' });
    return;
  }
  const userId = req.user.id;

  let info: SubscriptionInfo;
  try {
    info = await getSubscriptionInfo(userId);
  } catch (error) {
    subscriptionLogger.error({ err: error, userId }, 'Entitlement check failed');
    res.status(503).json({
      error: 'Subscription status is temporarily unavailable. Please try again.',
      code: 'ENTITLEMENT_UNAVAILABLE',
      retryable: true,
    });
    return;
  }

  if (!info.isEntitled) {
    if (entitlementConfig.isHardPaywallEnabled) {
      res.status(403).json(SUBSCRIPTION_REQUIRED_BODY);
      return;
    }
    if (!info.canPerformAction) {
      notifyLegacyLimitReached(userId, info);
      sendUsageLimitResponse(res, info);
      return;
    }
  } else if (info.dailyPromptsUsed >= generationDailyLimit(info)) {
    subscriptionLogger.warn(
      { userId, generationsToday: info.dailyPromptsUsed },
      'Fair-use ceiling reached',
    );
    sendUsageLimitResponse(res, info);
    return;
  }

  entitlementsByRequest.set(req, info);
  req.subscription = toRequestSubscription(info);
  next();
}
