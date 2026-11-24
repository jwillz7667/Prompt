import { z } from 'zod';

/**
 * Sign in with Apple server credentials, used only to obtain and revoke the
 * user's Apple refresh token (App Store guideline 5.1.1(v): deleting an
 * account must revoke its Sign in with Apple tokens).
 *
 * All-or-nothing: with none of the variables set the feature is disabled and
 * a boot warning is logged; a partial set is a misconfiguration and fails
 * the import (and therefore boot).
 */
export interface AppleSiwaConfig {
  teamId: string;
  keyId: string;
  /** PKCS#8 PEM of the Sign in with Apple key (.p8). */
  privateKey: string;
  /** AES-256-GCM key for refresh tokens at rest. */
  encryptionKey: Buffer;
}

export class AppleSiwaConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid Sign in with Apple configuration: ${issues.join('; ')}`);
    this.name = 'AppleSiwaConfigError';
  }
}

const blankToUndefined = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const envSchema = z.object({
  APPLE_TEAM_ID: blankToUndefined,
  APPLE_SIWA_KEY_ID: blankToUndefined,
  APPLE_SIWA_PRIVATE_KEY: blankToUndefined,
  APPLE_SIWA_TOKEN_ENCRYPTION_KEY: blankToUndefined,
});

const REQUIRED = [
  'APPLE_SIWA_KEY_ID',
  'APPLE_SIWA_PRIVATE_KEY',
  'APPLE_SIWA_TOKEN_ENCRYPTION_KEY',
] as const;

export function loadAppleSiwaConfig(env: NodeJS.ProcessEnv): AppleSiwaConfig | undefined {
  const values = envSchema.parse(env);
  const present = REQUIRED.filter((name) => values[name] !== undefined);
  if (present.length === 0) return undefined;

  const issues: string[] = [];
  for (const name of REQUIRED) {
    if (values[name] === undefined) issues.push(`${name} is required when any APPLE_SIWA_* is set`);
  }
  if (values.APPLE_TEAM_ID === undefined) issues.push('APPLE_TEAM_ID is required');
  const encryptionKey = values.APPLE_SIWA_TOKEN_ENCRYPTION_KEY
    ? Buffer.from(values.APPLE_SIWA_TOKEN_ENCRYPTION_KEY, 'base64')
    : undefined;
  if (encryptionKey && encryptionKey.length !== 32) {
    issues.push('APPLE_SIWA_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  }
  // Railway stores multi-line secrets with literal "\n".
  const privateKey = values.APPLE_SIWA_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (privateKey && !privateKey.includes('BEGIN PRIVATE KEY')) {
    issues.push('APPLE_SIWA_PRIVATE_KEY must be the PEM contents of the .p8 key');
  }
  if (
    issues.length > 0 ||
    !values.APPLE_TEAM_ID ||
    !values.APPLE_SIWA_KEY_ID ||
    !privateKey ||
    !encryptionKey
  ) {
    throw new AppleSiwaConfigError(issues);
  }
  return {
    teamId: values.APPLE_TEAM_ID,
    keyId: values.APPLE_SIWA_KEY_ID,
    privateKey,
    encryptionKey,
  };
}
