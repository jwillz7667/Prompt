/**
 * Runs in every vitest worker BEFORE test files import application modules,
 * so env is settled before the Prisma client and jwt utils read it.
 *
 * DATABASE_URL resolution order:
 *  1. TEST_DATABASE_URL — explicit local override
 *  2. existing DATABASE_URL when running in CI (the workflow provides a
 *     disposable service container)
 *  3. local docker default (see test/README in package.json scripts)
 *
 * Outside CI the ambient DATABASE_URL (a developer's .env) is deliberately
 * ignored — tests must never write to a real development database.
 */

const isCi = process.env['CI'] === 'true';

process.env['DATABASE_URL'] =
  process.env['TEST_DATABASE_URL'] ||
  (isCi ? process.env['DATABASE_URL'] : undefined) ||
  'postgresql://postgres:test@localhost:55434/promptomize_test';

process.env['NODE_ENV'] = 'test';
process.env['JWT_ACCESS_SECRET'] = process.env['JWT_ACCESS_SECRET'] || 'test-access-secret';
process.env['JWT_REFRESH_SECRET'] = process.env['JWT_REFRESH_SECRET'] || 'test-refresh-secret';
