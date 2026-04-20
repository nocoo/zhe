import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * Playwright E2E configuration.
 *
 * Tests run on a dedicated port (27006) to avoid conflicts with the
 * regular dev server (7006) and API E2E tests (17006).
 *
 * Port convention: dev=7006, API E2E=17006, BDD E2E=27006.
 * The webServer block always starts a fresh instance with PLAYWRIGHT=1
 * so the Credentials provider is available.
 *
 * Environment isolation: .env.local is loaded at config time so that
 * conditional KV logic can inspect CLOUDFLARE_KV_NAMESPACE_ID.
 * The webServer command uses ${VAR:?msg} bash syntax — if a required
 * test variable is unset, the shell errors out immediately instead of
 * silently falling back to production values.
 */
const E2E_PORT = 27006;
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
    } else {
      // Strip inline comments for unquoted values (e.g. KEY=value # comment)
      const commentIdx = value.indexOf(' #');
      if (commentIdx >= 0) value = value.slice(0, commentIdx).trim();
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local doesn't exist — fine, env comes from shell
}

// Resolve D1 proxy URL: D1_TEST_PROXY_URL > D1_PROXY_URL (must contain "-test")
// This matches run-api-e2e.ts priority order for consistency.
const testProxyUrl = process.env.D1_TEST_PROXY_URL;
const devProxyUrl = process.env.D1_PROXY_URL;
const resolvedProxyUrl = testProxyUrl || devProxyUrl;

if (!resolvedProxyUrl) {
  throw new Error(
    'D1_TEST_PROXY_URL (or D1_PROXY_URL) must be set — proxy coverage mandatory for E2E tests.'
  );
}
if (!resolvedProxyUrl.includes('-test')) {
  throw new Error(
    `D1 proxy URL must point to test Worker (contain "-test"). Got: "${resolvedProxyUrl}"`
  );
}

// Similarly resolve proxy secret
const testProxySecret = process.env.D1_TEST_PROXY_SECRET;
const devProxySecret = process.env.D1_PROXY_SECRET;
const resolvedProxySecret = testProxySecret || devProxySecret;

if (!resolvedProxySecret) {
  throw new Error(
    'D1_TEST_PROXY_SECRET (or D1_PROXY_SECRET) must be set.'
  );
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
  // D1 Proxy: use resolved values (already validated above)
  `D1_PROXY_URL=${resolvedProxyUrl}`,
  `D1_PROXY_SECRET=${resolvedProxySecret}`,
  `bun run next dev --turbopack -p ${E2E_PORT}`,
].filter(Boolean).join(' ');

export default defineConfig({
  testDir: './tests/playwright',
  globalSetup: './tests/playwright/global-setup.ts',
  globalTeardown: './tests/playwright/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 4,
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
