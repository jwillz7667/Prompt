import { createLogger } from '../../utils/logger.js';
import { prisma } from '../../utils/prisma.js';
import { createAppleTokenClient } from './apple-client.js';
import { loadAppleSiwaConfig } from './config.js';
import { createAppleAccountService, type AppleAccountService } from './service.js';

export {
  APPLE_REVOKE_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  AppleTokenError,
  createAppleTokenClient,
  type AppleTokenClient,
} from './apple-client.js';
export { AppleSiwaConfigError, loadAppleSiwaConfig, type AppleSiwaConfig } from './config.js';
export {
  REVOCATION_SWEEP_BATCH_SIZE,
  createAppleAccountService,
  type AppleAccountDeps,
  type AppleAccountService,
} from './service.js';
export { openAppleTokenGrant, sealAppleTokenGrant, type AppleTokenGrant } from './token-cipher.js';

const appleAccountLogger = createLogger({ module: 'apple-account' });

// Parsed at import so a partial configuration fails boot (see config.ts).
const siwaConfig = loadAppleSiwaConfig(process.env);

if (!siwaConfig) {
  const log = process.env['NODE_ENV'] === 'production' ? 'error' : 'warn';
  appleAccountLogger[log](
    {},
    'BOOT: Sign in with Apple token revocation is disabled (set APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY, APPLE_SIWA_TOKEN_ENCRYPTION_KEY)',
  );
}

/** Process-wide instance bound to Prisma and the environment's SIWA credentials. */
export const appleAccountService: AppleAccountService = createAppleAccountService({
  config: siwaConfig,
  client: siwaConfig ? createAppleTokenClient(siwaConfig) : undefined,
  db: prisma,
  logger: appleAccountLogger,
});
