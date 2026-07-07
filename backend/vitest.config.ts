import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/setup-env.ts'],
    // Singletons (Prisma client, loggers) make shared workers hazardous;
    // forks isolate module state per test file.
    pool: 'forks',
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
