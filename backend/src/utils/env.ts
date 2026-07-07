import { logger } from './logger.js';

/**
 * Boot-time environment validation.
 *
 * Philosophy: fail LOUD, not fatal. A hard boot crash on a single missing var
 * previously turned a misconfiguration into a full outage (the deploy would
 * crash-loop). Instead we log a high-visibility report at startup so an
 * operator can act immediately, while the process stays up and degrades only
 * the affected capability. Genuinely unsafe defaults (production JWT secrets)
 * are still enforced at their point of use in `jwt.ts`.
 */

interface EnvVarSpec {
  name: string;
  // Why this var matters — surfaced in logs so the impact is obvious.
  purpose: string;
}

// Without these, a core user-facing capability is broken.
const REQUIRED: EnvVarSpec[] = [
  { name: 'DATABASE_URL', purpose: 'Postgres connection — all persistence (chat history, subscriptions)' },
  { name: 'JWT_ACCESS_SECRET', purpose: 'Signs/verifies access tokens — authentication fails without it' },
  { name: 'JWT_REFRESH_SECRET', purpose: 'Signs/verifies refresh tokens — sessions cannot be renewed' },
  { name: 'DEEPSEEK_API_KEY', purpose: 'Upstream model provider — prompt enhancement returns errors without it' },
  { name: 'BACKEND_WEBHOOK_SECRET', purpose: 'Authenticates internal Stripe webhooks — subscription tier goes stale without it' },
];

// Absence degrades the service but does not break the core loop.
const RECOMMENDED: EnvVarSpec[] = [
  { name: 'REDIS_URL', purpose: 'Cache, BullMQ queues, distributed rate limiting — degraded performance without it' },
  { name: 'GOOGLE_CLIENT_ID', purpose: 'Google Sign-In verification' },
  { name: 'APPLE_PRIVATE_KEY', purpose: 'App Store Server API — StoreKit receipt/notification validation' },
  { name: 'STRIPE_API_SECRET_KEY', purpose: 'Enterprise API billing (separate from app subscriptions)' },
  { name: 'RESEND_API_KEY', purpose: 'Transactional email delivery' },
  { name: 'RESEND_WEBHOOK_SECRET', purpose: 'Verifies Resend inbound-email webhooks — support-ticket email replies are rejected without it' },
];

function isPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

// Names of REQUIRED vars that are currently unset. Shared with the /health
// config check so a misconfigured deploy turns the comprehensive health check
// (and therefore the CI deploy gate) red, instead of only failing per-request.
export function getMissingRequiredEnvVars(): string[] {
  return REQUIRED.filter((spec) => !isPresent(spec.name)).map((spec) => spec.name);
}

export function validateEnvAtBoot(): void {
  const isProduction = process.env['NODE_ENV'] === 'production';

  const missingRequired = REQUIRED.filter((spec) => !isPresent(spec.name));
  const missingRecommended = RECOMMENDED.filter((spec) => !isPresent(spec.name));

  if (missingRequired.length > 0) {
    logger.error(
      { missing: missingRequired.map((spec) => spec.name) },
      'BOOT: required environment variables are missing — core capabilities will fail until they are set',
    );
    for (const spec of missingRequired) {
      logger.error({ envVar: spec.name, purpose: spec.purpose }, `BOOT: missing required env var ${spec.name}`);
    }
  }

  if (missingRecommended.length > 0) {
    logger.warn(
      { missing: missingRecommended.map((spec) => spec.name) },
      'BOOT: recommended environment variables are missing — running in degraded mode',
    );
  }

  if (missingRequired.length === 0 && missingRecommended.length === 0) {
    logger.info('BOOT: environment validation passed');
  }

  // The dev fallbacks in jwt.ts are acceptable locally but must never be relied
  // on in production; jwt.ts throws in production, this just makes the dev case
  // visible so a missing secret is never silently masked.
  if (!isProduction && (!isPresent('JWT_ACCESS_SECRET') || !isPresent('JWT_REFRESH_SECRET'))) {
    logger.warn('BOOT: using development JWT fallback secrets — set JWT_ACCESS_SECRET/JWT_REFRESH_SECRET');
  }
}
