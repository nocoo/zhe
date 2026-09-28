import { defineConfig, devices } from "@playwright/test";
import { localRunId } from "./scripts/lib/local-run";
import { prepareTestEnvironment } from "./scripts/lib/test-environment";

prepareTestEnvironment();
const E2E_PORT = Number(process.env.ZHE_TEST_APP_PORT ?? 27006);
const E2E_BASE = `http://localhost:${E2E_PORT}`;

const WORKER_PORT = Number(process.env.ZHE_TEST_WORKER_PORT ?? 8788);
const R2_PORT = WORKER_PORT;
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
const runId = localRunId();
process.env.ZHE_AUTH_STATE = `.artifacts/e2e/${runId}/auth.json`;
const D1_PROXY_SECRET = "local-d1-proxy-secret";
const WORKER_SECRET = "local-worker-secret";

export default defineConfig({
  testDir: "./tests/playwright",
  globalSetup: "./tests/playwright/global-setup.ts",
  globalTeardown: "./tests/playwright/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: true,
  maxFailures: 1,
  retries: process.env.CI ? 2 : 0,
  // Conflicting browser mutations share one owned run.
  workers: 1,
  // Local runs share the machine with daily development.
  expect: { timeout: process.env.CI ? 5_000 : 15_000 },
  outputDir: `.artifacts/e2e/${runId}/results`,
  reporter: [["html", { outputFolder: `.artifacts/e2e/${runId}/report`, open: "never" }]],
  timeout: 30_000,

  use: {
    baseURL: E2E_BASE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    ...(process.env.ZHE_DATASET === "demo"
      ? [
          {
            name: "capture",
            testMatch: /capture\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: process.env.ZHE_AUTH_STATE,
              locale: "zh-CN",
              timezoneId: "Asia/Shanghai",
            },
            dependencies: ["setup"],
          },
        ]
      : [
          {
            name: "chromium",
            testIgnore: /capture\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: process.env.ZHE_AUTH_STATE,
            },
            dependencies: ["setup"],
          },
          {
            name: "iphone",
            testMatch: /(?:card-actions|global-create)\.spec\.ts/,
            use: {
              ...devices["iPhone 13"],
              storageState: process.env.ZHE_AUTH_STATE,
            },
            dependencies: ["setup"],
          },
        ]),
  ],

  webServer: {
    command: `bun run next build && bun run next start -p ${E2E_PORT}`,
    url: E2E_BASE,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    env: {
      PLAYWRIGHT: "1",
      ZHE_ENVIRONMENT: "e2e",
      ZHE_LOCAL_AUTH_TOKEN: process.env.ZHE_LOCAL_AUTH_TOKEN ?? "",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "",
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      AUTH_ALLOWED_EMAILS: "e2e@test.local",
      AUTH_URL: E2E_BASE,
      D1_PROXY_URL: WORKER_URL,
      D1_PROXY_SECRET,
      LOCAL_R2: "1",
      R2_BUCKET_NAME: "zhe-local",
      R2_PUBLIC_DOMAIN: `http://127.0.0.1:${R2_PORT}/r2`,
      R2_ACCESS_KEY_ID: "local-access-key",
      R2_SECRET_ACCESS_KEY: "local-secret-key",
      R2_ENDPOINT: `http://127.0.0.1:${R2_PORT}`,
      // actions/upload.ts + actions/links/screenshot.ts refuse to mint a
      // presigned URL without this; without it Upload UI silently never
      // starts a PUT and uploads.spec.ts hangs 30s waiting for upload-item.
      R2_USER_HASH_SALT: "local-test-salt",
      CLOUDFLARE_API_BASE_URL: WORKER_URL,
      CLOUDFLARE_ACCOUNT_ID: "local",
      CLOUDFLARE_KV_NAMESPACE_ID: "local",
      CLOUDFLARE_API_TOKEN: D1_PROXY_SECRET,
      WORKER_SECRET,
    },
  },
});
