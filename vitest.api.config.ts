import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for API E2E tests (real HTTP).
 *
 * Key differences from vitest.config.ts:
 * - NO setupFiles — does not load the D1 in-memory mock
 * - Environment is 'node' not 'jsdom' — no DOM needed
 * - Only includes tests/api/**
 * - No coverage collection (API tests are L2, not L1)
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/api/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 15_000, // real HTTP can be slower
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
