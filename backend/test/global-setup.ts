import { execSync } from 'node:child_process';

// Mirrors test/setup-env.ts (globalSetup runs in a separate context from the
// workers, so the resolution is duplicated rather than shared via env).
const isCi = process.env['CI'] === 'true';
const databaseUrl =
  process.env['TEST_DATABASE_URL'] ||
  (isCi ? process.env['DATABASE_URL'] : undefined) ||
  'postgresql://postgres:test@localhost:55434/promptomize_test';

export default function setup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
