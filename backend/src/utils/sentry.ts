import * as Sentry from '@sentry/node';

import { logger } from './logger.js';

/**
 * Error tracking is opt-in: without SENTRY_DSN every function here is a
 * no-op, so local dev and self-hosted deploys pay no cost. When the DSN is
 * set (Railway production), unhandled 5xx errors captured by the error
 * handler middleware are reported with request context.
 */

const SENTRY_DSN = process.env['SENTRY_DSN'] || '';

export const isSentryEnabled = SENTRY_DSN.length > 0;

export function initSentry(): void {
  if (!isSentryEnabled) {
    logger.info('BOOT: Sentry disabled (SENTRY_DSN not set)');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env['NODE_ENV'] || 'development',
    release: process.env['RAILWAY_GIT_COMMIT_SHA'] || undefined,
    // Error reporting only. Tracing multiplies event volume and cost;
    // enable deliberately via env if ever wanted, not by default.
    tracesSampleRate: 0,
  });
  logger.info('BOOT: Sentry error tracking enabled');
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!isSentryEnabled) {
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
