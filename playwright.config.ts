import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Tests run against the Next.js dev server on port 7005.
 * Auth is handled via a Credentials provider activated by PLAYWRIGHT=1.
 * AUTH_URL is overridden to http://localhost:7005 so NextAuth uses
 * non-secure cookies (no __Secure- / __Host- prefix).
 */
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
    baseURL: 'http://localhost:7005',
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
    command: 'PLAYWRIGHT=1 AUTH_URL=http://localhost:7005 bun run dev',
    url: 'http://localhost:7005',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
