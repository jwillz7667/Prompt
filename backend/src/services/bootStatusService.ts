import { logger } from '../utils/logger.js';
import { captureError } from '../utils/sentry.js';

/**
 * Degraded-boot detection. scripts/start.sh deliberately boots the server even
 * when `prisma migrate deploy` fails (a crash-loop is worse than a degraded
 * service), but it exports MIGRATE_DEPLOY_FAILED=1 plus the tail of the deploy
 * output so the failure is observable from inside the app: a fatal log line at
 * startup, a Sentry event, and `migrations: "failed_at_boot"` on /health —
 * which the scheduled uptime workflow turns into an alert.
 */

export type MigrationBootStatus = 'ok' | 'failed_at_boot';

export function getMigrationBootStatus(): MigrationBootStatus {
  return process.env['MIGRATE_DEPLOY_FAILED'] === '1' ? 'failed_at_boot' : 'ok';
}

// Called once from index.ts after Sentry is initialized. Fatal (not error)
// because the process is serving with a schema that may not match the Prisma
// client — every request is at risk until a human intervenes.
export function reportDegradedBootIfNeeded(): void {
  if (getMigrationBootStatus() === 'ok') {
    return;
  }

  const deployOutputTail =
    process.env['MIGRATE_DEPLOY_ERROR_TAIL'] || '(deploy output not captured)';

  logger.fatal(
    { deployOutputTail },
    'DEGRADED_BOOT: prisma migrate deploy failed at startup; serving with a potentially stale schema. INVESTIGATE IMMEDIATELY.'
  );
  captureError(new Error('DEGRADED_BOOT: prisma migrate deploy failed at startup'), {
    deployOutputTail,
  });
}
