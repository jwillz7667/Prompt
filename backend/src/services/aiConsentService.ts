/**
 * Server-side record of the user's consent to share their content (prompts,
 * chat messages, attached images) with third-party AI service providers
 * (App Store guideline 5.1.2(i)).
 *
 * The consent is per account, not per device, so a reinstall or a new device
 * does not re-prompt. AI_DATA_CONSENT_VERSION identifies the disclosure text;
 * raising it re-requires consent from everyone who agreed to an older text.
 *
 * Feature flag AI_CONSENT_ENFORCED (default false, validated at boot):
 *   Rollout: iOS builds shipped before this release do not know the
 *   AI_CONSENT_REQUIRED code and would show a generic error instead of the
 *   consent screen. Keep the flag off until the iOS build that syncs consent to
 *   the server is the minimum supported version (older builds force-updated or
 *   negligible in analytics), then set AI_CONSENT_ENFORCED=true in Railway; it
 *   applies on the next restart without a code deploy, and setting it back to
 *   false is the rollback. Recording and withdrawing consent work regardless of
 *   the flag, so the consenting build populates the column before enforcement.
 *   Cleanup: once enforcement has been on for one full release, delete the flag
 *   and the disabled branch in requireAiConsent.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

const blankAsUnset = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const aiConsentEnvSchema = z.object({
  AI_CONSENT_ENFORCED: z.preprocess(
    blankAsUnset,
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  ),
  AI_DATA_CONSENT_VERSION: z.preprocess(
    blankAsUnset,
    z.coerce.number().int().min(1).default(1),
  ),
});

export interface AiConsentConfig {
  isEnforced: boolean;
  /** Version of the disclosure the user must have agreed to. */
  currentVersion: number;
}

export function parseAiConsentConfig(env: NodeJS.ProcessEnv): AiConsentConfig {
  const parsed = aiConsentEnvSchema.parse(env);
  return {
    isEnforced: parsed.AI_CONSENT_ENFORCED,
    currentVersion: parsed.AI_DATA_CONSENT_VERSION,
  };
}

// Parsed at import so an invalid value fails boot rather than the first request.
export const aiConsentConfig: AiConsentConfig = parseAiConsentConfig(process.env);

/** The consent as every user payload exposes it. */
export type AiDataConsent = { version: number; grantedAt: string } | null;

export interface AiConsentColumns {
  aiDataConsentAt: Date | null;
  aiDataConsentVersion: number | null;
}

/** Spread into a Prisma `select` on User to load the columns toAiDataConsent reads. */
export const AI_CONSENT_SELECT = {
  aiDataConsentAt: true,
  aiDataConsentVersion: true,
} as const satisfies Prisma.UserSelect;

export function toAiDataConsent(columns: AiConsentColumns): AiDataConsent {
  if (columns.aiDataConsentAt === null || columns.aiDataConsentVersion === null) return null;
  return {
    version: columns.aiDataConsentVersion,
    grantedAt: columns.aiDataConsentAt.toISOString(),
  };
}

export function hasCurrentConsent(consent: AiDataConsent, requiredVersion: number): boolean {
  return consent !== null && consent.version >= requiredVersion;
}

export class AiConsentError extends Error {
  constructor(
    readonly code: 'AI_CONSENT_VERSION_UNKNOWN' | 'USER_NOT_FOUND',
    message: string,
    readonly statusCode: 400 | 404,
  ) {
    super(message);
    this.name = 'AiConsentError';
  }
}

export interface AiConsentState {
  aiDataConsent: AiDataConsent;
  requiredVersion: number;
}

async function readConsent(userId: string, currentVersion: number): Promise<AiConsentState> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: AI_CONSENT_SELECT });
  if (!user) throw new AiConsentError('USER_NOT_FOUND', 'User not found', 404);
  return { aiDataConsent: toAiDataConsent(user), requiredVersion: currentVersion };
}

export async function getAiConsent(
  userId: string,
  config: AiConsentConfig = aiConsentConfig,
): Promise<AiDataConsent> {
  return (await readConsent(userId, config.currentVersion)).aiDataConsent;
}

/**
 * Records consent to `version`. Idempotent: repeating the same (or a lower)
 * version keeps the original grant and timestamp; only a higher version
 * replaces it. A version above the current one is rejected because no client
 * can have shown that disclosure yet.
 */
export async function grantAiConsent(
  userId: string,
  version: number,
  config: AiConsentConfig = aiConsentConfig,
): Promise<AiConsentState> {
  if (version > config.currentVersion) {
    throw new AiConsentError(
      'AI_CONSENT_VERSION_UNKNOWN',
      `Consent version ${version} is newer than the current version ${config.currentVersion}`,
      400,
    );
  }
  // The conditional update is the idempotency guard: concurrent retries of the
  // same grant cannot overwrite each other's timestamp.
  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ aiDataConsentVersion: null }, { aiDataConsentVersion: { lt: version } }],
    },
    data: { aiDataConsentAt: new Date(), aiDataConsentVersion: version },
  });
  return readConsent(userId, config.currentVersion);
}

export async function withdrawAiConsent(
  userId: string,
  config: AiConsentConfig = aiConsentConfig,
): Promise<AiConsentState> {
  await prisma.user.updateMany({
    where: { id: userId },
    data: { aiDataConsentAt: null, aiDataConsentVersion: null },
  });
  return readConsent(userId, config.currentVersion);
}
