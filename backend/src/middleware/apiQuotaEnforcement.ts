/**
 * API Quota Enforcement Middleware
 *
 * Guards every developer API route that reaches a model: only an ACTIVE paid
 * plan passes (402 API_PLAN_REQUIRED otherwise), then the monthly quota is
 * enforced (429 QUOTA_EXCEEDED). Non-AI routes must not use it so free
 * accounts can still read usage, models and history.
 */

import { type Response, type NextFunction } from 'express';
import {
  getApiSubscriptionInfo,
  canMakeRequest,
  API_BILLING_PATH,
} from '../services/apiSubscriptionService.js';
import { recordUsage, recordUsageAsync } from '../services/apiUsageService.js';
import { logger } from '../utils/logger.js';
import type { ApiKeyRequest } from './apiKeyAuth.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ApiQuotaRequest extends ApiKeyRequest {
  apiQuota?: {
    tier: string;
    monthlyLimit: number;
    used: number;
    remaining: number;
    overageAllowed: boolean;
  };
  usageStart?: number; // For timing
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Check API quota before processing request.
 * Attaches quota info to request for downstream use.
 */
export const enforceApiQuota = async (
  req: ApiQuotaRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // Skip if no API key (should be caught by auth middleware)
  if (!req.apiKey) {
    next();
    return;
  }

  const startTime = Date.now();
  req.usageStart = startTime;

  try {
    const developerId = req.apiKey.developerId;
    const quotaCheck = await canMakeRequest(developerId);

    if (!quotaCheck.allowed && quotaCheck.reason === 'API_PLAN_REQUIRED') {
      logger.info(
        { developerId, keyId: req.apiKey.id },
        'Blocked AI request without a paid API plan',
      );
      res.status(402).json({
        error: 'A paid API plan is required',
        code: 'API_PLAN_REQUIRED',
        message: quotaCheck.message,
        upgradeUrl: API_BILLING_PATH,
      });
      return;
    }

    if (!quotaCheck.allowed) {
      logger.warn({ developerId, keyId: req.apiKey.id }, 'API quota exceeded');

      // Get full info for response
      const info = await getApiSubscriptionInfo(developerId);

      res.status(429).json({
        error: 'Quota exceeded',
        code: 'QUOTA_EXCEEDED',
        message: quotaCheck.message,
        quota: {
          tier: info.tier,
          used: info.currentPeriodUsage,
          limit: info.monthlyRequestLimit,
          remaining: 0,
          periodEnd: info.currentPeriodEnd.toISOString(),
        },
        upgrade:
          info.tier !== 'API_ENTERPRISE'
            ? {
                message: 'Upgrade your plan for more requests',
                url: API_BILLING_PATH,
              }
            : undefined,
      });
      return;
    }

    // Attach quota info to request
    const info = await getApiSubscriptionInfo(developerId);
    req.apiQuota = {
      tier: info.tier,
      monthlyLimit: info.monthlyRequestLimit,
      used: info.currentPeriodUsage,
      remaining: info.remainingRequests,
      overageAllowed: info.overageAllowed,
    };

    // Set quota headers
    res.set({
      'X-Quota-Limit':
        info.monthlyRequestLimit === -1 ? 'unlimited' : info.monthlyRequestLimit.toString(),
      'X-Quota-Remaining':
        info.remainingRequests === -1 ? 'unlimited' : info.remainingRequests.toString(),
      'X-Quota-Reset': info.currentPeriodEnd.toISOString(),
    });

    next();
  } catch (error) {
    logger.error({ error, keyId: req.apiKey.id }, 'Quota enforcement error');
    // Do not incur provider cost when entitlement/quota cannot be checked.
    res.status(503).json({
      error: 'Usage limits are temporarily unavailable. Please retry.',
      code: 'QUOTA_UNAVAILABLE',
    });
  }
};

/**
 * Record usage after successful response.
 * Call this in route handlers after sending successful response.
 */
export const recordApiUsage = async (
  req: ApiQuotaRequest,
  res: Response,
  options: {
    inputTokens?: number;
    outputTokens?: number;
    modality?: string;
  } = {},
): Promise<void> => {
  if (!req.apiKey) {
    return;
  }

  const latencyMs = req.usageStart ? Date.now() - req.usageStart : 0;

  await recordUsage({
    apiKeyId: req.apiKey.id,
    developerId: req.apiKey.developerId,
    endpoint: req.path,
    method: req.method,
    statusCode: res.statusCode,
    inputTokens: options.inputTokens,
    outputTokens: options.outputTokens,
    latencyMs,
    modality: options.modality,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });
};

/**
 * Middleware that records usage for all responses.
 * Use after routes to capture response status.
 */
export const autoRecordUsage = (req: ApiQuotaRequest, res: Response, next: NextFunction): void => {
  // Hook into response finish event
  res.on('finish', () => {
    if (req.apiKey && res.statusCode < 500) {
      // Record usage for all non-server-error responses
      recordUsageAsync({
        apiKeyId: req.apiKey.id,
        developerId: req.apiKey.developerId,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        latencyMs: req.usageStart ? Date.now() - req.usageStart : 0,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
    }
  });

  next();
};

// ============================================================================
// QUOTA INFO ENDPOINT HELPER
// ============================================================================

/**
 * Get formatted quota info for API response.
 */
export async function getQuotaInfo(developerId: string): Promise<{
  tier: string;
  status: string;
  quota: {
    used: number;
    limit: number | 'unlimited';
    remaining: number | 'unlimited';
    periodStart: string;
    periodEnd: string;
  };
  rateLimit: {
    requestsPerMinute: number;
  };
  credits: {
    purchasedRemaining: number;
    monthlyIncluded: number | 'unlimited';
  };
  features: string[];
  plan: {
    canEnhance: boolean;
    upgradeRequired: boolean;
    upgradeUrl: string;
  };
}> {
  const info = await getApiSubscriptionInfo(developerId);

  return {
    tier: info.tier,
    status: info.status,
    quota: {
      used: info.currentPeriodUsage,
      limit: info.monthlyRequestLimit === -1 ? 'unlimited' : info.monthlyRequestLimit,
      remaining: info.remainingRequests === -1 ? 'unlimited' : info.remainingRequests,
      periodStart: info.currentPeriodStart.toISOString(),
      periodEnd: info.currentPeriodEnd.toISOString(),
    },
    rateLimit: {
      requestsPerMinute: info.requestsPerMinute,
    },
    credits: {
      purchasedRemaining: info.prepaidCreditsRemaining,
      monthlyIncluded: info.baseMonthlyRequests === -1 ? 'unlimited' : info.baseMonthlyRequests,
    },
    features: info.features,
    plan: {
      canEnhance: info.canMakeRequests,
      upgradeRequired: !info.hasActivePaidPlan,
      upgradeUrl: API_BILLING_PATH,
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getClientIp(req: ApiQuotaRequest): string | undefined {
  // Check various headers for client IP
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
    return ips?.split(',')[0]?.trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return typeof realIp === 'string' ? realIp : realIp[0];
  }

  return req.socket.remoteAddress;
}
