import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for L2 API E2E tests (real HTTP).
 *
 * Key differences from vitest.config.ts:
 * - NO setupFiles — does not load the D1 in-memory mock
 * - Environment is 'node' not 'jsdom' — no DOM needed
 * - Includes ALL tests/api/*.test.ts files (unified real HTTP)
 * - No coverage collection (API tests are L2, not L1)
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'tests/api/**/*.test.ts',
    ],
    testTimeout: 15_000, // real HTTP can be slower
    fileParallelism: true,
    maxConcurrency: 4,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
