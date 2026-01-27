import { Response, NextFunction } from 'express';
import { type AuthenticatedRequest } from './auth.js';
import {
  canPerformAction,
  getSubscriptionInfo,
  recordUsage,
  type QuotaAction,
} from '../services/subscriptionService.js';
import { subscriptionLogger } from '../utils/logger.js';

// Extend AuthenticatedRequest to include subscription info
export interface RequestWithSubscription extends AuthenticatedRequest {
  subscription?: {
    tier: string;
    promptQuality: 'basic' | 'standard' | 'advanced';
    dailyPromptsUsed: number;
    dailyPromptsLimit: number;
    canExport: boolean;
    maxTokensPerPrompt: number;
  };
}

/**
 * Middleware factory to enforce quota for specific actions
 */
export function enforceQuota(action: QuotaAction) {
  return async (
    req: RequestWithSubscription,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const result = await canPerformAction(req.user.id, action);

      if (!result.allowed) {
        res.status(403).json({
          error: 'Quota exceeded',
          code: result.reason,
          message: getQuotaErrorMessage(result.reason || 'UNKNOWN'),
          remainingQuota: result.remainingQuota,
        });
        return;
      }

      // Attach subscription info to request for downstream use
      const subscriptionInfo = await getSubscriptionInfo(req.user.id);
      req.subscription = {
        tier: subscriptionInfo.tier,
        promptQuality: subscriptionInfo.features.promptQuality,
        dailyPromptsUsed: subscriptionInfo.dailyPromptsUsed,
        dailyPromptsLimit: subscriptionInfo.dailyPromptsLimit,
        canExport: subscriptionInfo.features.canExport,
        maxTokensPerPrompt: subscriptionInfo.features.maxTokensPerPrompt,
      };

      next();
    } catch (error) {
      subscriptionLogger.error({ err: error, userId: req.user?.id, action }, 'Quota enforcement error');
      res.status(500).json({ error: 'Failed to check quota' });
    }
  };
}

/**
 * Middleware to record usage after successful prompt creation
 * Should be called AFTER the response is sent
 */
export function recordPromptUsage() {
  return async (
    req: RequestWithSubscription,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Store original res.json to intercept successful responses
    const originalJson = res.json.bind(res);

    res.json = function (body: Record<string, unknown>) {
      // Only record usage on successful prompt creation (201 status)
      if (res.statusCode === 201 && req.user) {
        recordUsage(req.user.id).catch((err) => {
          subscriptionLogger.error({ err, userId: req.user?.id }, 'Failed to record usage');
        });
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware to check subscription and attach info without blocking
 */
export async function attachSubscriptionInfo(
  req: RequestWithSubscription,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      next();
      return;
    }

    const subscriptionInfo = await getSubscriptionInfo(req.user.id);
    req.subscription = {
      tier: subscriptionInfo.tier,
      promptQuality: subscriptionInfo.features.promptQuality,
      dailyPromptsUsed: subscriptionInfo.dailyPromptsUsed,
      dailyPromptsLimit: subscriptionInfo.dailyPromptsLimit,
      canExport: subscriptionInfo.features.canExport,
      maxTokensPerPrompt: subscriptionInfo.features.maxTokensPerPrompt,
    };

    next();
  } catch (error) {
    subscriptionLogger.warn({ err: error, userId: req.user?.id }, 'Failed to attach subscription info');
    // Don't block the request if subscription check fails
    next();
  }
}

function getQuotaErrorMessage(reason: string): string {
  switch (reason) {
    case 'QUOTA_EXCEEDED':
      return 'You have reached your daily prompt limit. Upgrade your plan for more prompts.';
    case 'FEATURE_LOCKED':
      return 'This feature is not available on your current plan. Please upgrade to access it.';
    default:
      return 'Action not allowed on your current plan.';
  }
}
