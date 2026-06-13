import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Tests run on a dedicated port (27006) to avoid conflicts with the
 * regular dev server (7006) and API E2E tests (17006).
 *
 * Port convention: dev=7006, API E2E=17006, BDD E2E=27006.
 *
 * Local stack: globalSetup boots scripts/test-stack.ts (wrangler dev on
 * 8788 + R2 fs shim on 18788). The webServer reads the same constants so
 * D1/R2 traffic from Next.js lands on the local stack — no remote
 * Cloudflare resources required at any layer.
 *
 * Local-stack constants are inlined here instead of imported from
 * scripts/test-stack.ts: Playwright loads this config under a CJS TS
 * loader, but Node 22 resolves the script's `.ts` import as ESM, leading
 * to a CJS/ESM mismatch ("exports is not defined"). The values are short
 * and stable; keep them in sync with the same constants in
 * scripts/test-stack.ts.
 */
const E2E_PORT = 27006;
const E2E_BASE = `http://localhost:${E2E_PORT}`;

const WORKER_PORT = 8788;
const R2_PORT = 18788;
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
const R2_DIR = '.test-storage/r2';
const D1_PROXY_SECRET = 'local-d1-proxy-secret';
const WORKER_SECRET = 'local-worker-secret';

export default defineConfig({
  testDir: './tests/playwright',
  globalSetup: './tests/playwright/global-setup.ts',
  globalTeardown: './tests/playwright/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Local workers capped at 4: turbopack dev-server collapses under more
  // concurrency (hydration mismatches, 30s timeouts) when many specs
  // first-compile pages in parallel. CI matches the same cap.
  workers: 4,
  reporter: 'html',
  timeout: 30_000,

  use: {
    baseURL: E2E_BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
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
    command: `bun run next dev --turbopack -p ${E2E_PORT}`,
    url: E2E_BASE,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PLAYWRIGHT: '1',
      AUTH_URL: E2E_BASE,
      D1_PROXY_URL: WORKER_URL,
      D1_PROXY_SECRET,
      LOCAL_R2: '1',
      LOCAL_R2_DIR: R2_DIR,
      LOCAL_R2_PORT: String(R2_PORT),
      R2_BUCKET_NAME: 'zhe-local',
      R2_PUBLIC_DOMAIN: `http://127.0.0.1:${R2_PORT}/r2`,
      R2_ACCESS_KEY_ID: 'local-access-key',
      R2_SECRET_ACCESS_KEY: 'local-secret-key',
      R2_ENDPOINT: `http://127.0.0.1:${R2_PORT}`,
      // actions/upload.ts + actions/links/screenshot.ts refuse to mint a
      // presigned URL without this; without it Upload UI silently never
      // starts a PUT and uploads.spec.ts hangs 30s waiting for upload-item.
      R2_USER_HASH_SALT: 'local-test-salt',
      WORKER_SECRET,
    },
  },
});
