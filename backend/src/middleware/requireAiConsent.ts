/**
 * AI data-sharing consent gate (App Store guideline 5.1.2(i)).
 *
 * requireEntitlement runs it after a successful entitlement check, so on every
 * AI route the paywall 403 (QUOTA_EXCEEDED) always wins over this one and a
 * lapsed user is shown the paywall, not the consent screen. Like the paywall it
 * responds before any SSE header is written:
 *   403 {error:'AI data sharing consent required', code:'AI_CONSENT_REQUIRED', requiredVersion}
 * when the account has no consent or consented to an older disclosure version.
 *
 * No-op while AI_CONSENT_ENFORCED is false; see aiConsentService for the rollout.
 */
import type { NextFunction, Request, Response } from 'express';
import {
  aiConsentConfig,
  getAiConsent,
  hasCurrentConsent,
  type AiConsentConfig,
} from '../services/aiConsentService.js';
import { logger } from '../utils/logger.js';

export function aiConsentRequiredBody(requiredVersion: number) {
  return {
    error: 'AI data sharing consent required',
    code: 'AI_CONSENT_REQUIRED',
    requiredVersion,
  } as const;
}

export function createRequireAiConsent(config: AiConsentConfig = aiConsentConfig) {
  return async function requireAiConsent(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!config.isEnforced) {
      next();
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated', code: 'TOKEN_MISSING' });
      return;
    }
    const userId = req.user.id;

    let isConsented: boolean;
    try {
      isConsented = hasCurrentConsent(await getAiConsent(userId, config), config.currentVersion);
    } catch (error) {
      logger.error({ err: error, userId }, 'AI consent check failed');
      res.status(503).json({
        error: 'Consent status is temporarily unavailable. Please try again.',
        code: 'AI_CONSENT_UNAVAILABLE',
        retryable: true,
      });
      return;
    }

    if (!isConsented) {
      res.status(403).json(aiConsentRequiredBody(config.currentVersion));
      return;
    }
    next();
  };
}

export const requireAiConsent = createRequireAiConsent();
