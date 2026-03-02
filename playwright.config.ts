import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Tests run on a dedicated port (27005) to avoid conflicts with the
 * regular dev server (7005) and API E2E tests (17005).
 *
 * Port convention: dev=7005, API E2E=17005, BDD E2E=27005.
 * The webServer block always starts a fresh instance with PLAYWRIGHT=1
 * so the Credentials provider is available.
 */
const E2E_PORT = 27005;
const E2E_BASE = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './tests/playwright',
  globalSetup: './tests/playwright/global-setup.ts',
  globalTeardown: './tests/playwright/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30_000,

  use: {
    baseURL: E2E_BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Setup project: authenticates and saves storageState
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: `PLAYWRIGHT=1 AUTH_URL=${E2E_BASE} bun run next dev --turbopack -p ${E2E_PORT}`,
    url: E2E_BASE,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
