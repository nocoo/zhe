import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * Playwright E2E configuration.
 *
 * Tests run on a dedicated port (27005) to avoid conflicts with the
 * regular dev server (7005) and API E2E tests (17005).
 *
 * Port convention: dev=7005, API E2E=17005, BDD E2E=27005.
 * The webServer block always starts a fresh instance with PLAYWRIGHT=1
 * so the Credentials provider is available.
 *
 * Environment isolation: .env.local is loaded at config time so that
 * conditional KV logic can inspect CLOUDFLARE_KV_NAMESPACE_ID.
 * The webServer command uses ${VAR:?msg} bash syntax — if a required
 * test variable is unset, the shell errors out immediately instead of
 * silently falling back to production values.
 */
const E2E_PORT = 27005;
const E2E_BASE = `http://localhost:${E2E_PORT}`;

// Load .env.local at config time for KV conditional logic
// (playwright.config.ts is a Node script — doesn't auto-read .env.local)
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local doesn't exist — fine, env comes from shell
}

// Build webServer command with test environment overrides
const webServerCommandParts = [
  'PLAYWRIGHT=1',
  `AUTH_URL=${E2E_BASE}`,
  'CLOUDFLARE_D1_DATABASE_ID=${D1_TEST_DATABASE_ID:?D1_TEST_DATABASE_ID not set}',
  'R2_BUCKET_NAME=${R2_TEST_BUCKET_NAME:?R2_TEST_BUCKET_NAME not set}',
  'R2_PUBLIC_DOMAIN=${R2_TEST_PUBLIC_DOMAIN:?R2_TEST_PUBLIC_DOMAIN not set}',
  // KV: if production ID is configured, require test ID; otherwise don't pass (KV inactive)
  process.env.CLOUDFLARE_KV_NAMESPACE_ID
    ? 'CLOUDFLARE_KV_NAMESPACE_ID=${KV_TEST_NAMESPACE_ID:?KV_TEST_NAMESPACE_ID not set}'
    : '',
  `bun run next dev --turbopack -p ${E2E_PORT}`,
].filter(Boolean).join(' ');

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
    command: webServerCommandParts,
    url: E2E_BASE,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
