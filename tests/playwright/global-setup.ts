/**
 * Playwright global setup — start the local stack and verify test marker.
 *
 * No remote Cloudflare resources required. The wrangler dev subprocess and R2
 * filesystem shim live for the entire Playwright session; global-teardown
 * (same Node process) stops them.
 */
import { resolve } from "node:path";
import {
  applyLocalStackEnv,
  type LocalStack,
  loadEnvFile,
  setWorkerCrashHandler,
  startLocalStack,
  WRANGLER_LOG_PATH,
} from "../../scripts/test-stack";
import { executeD1, queryD1, TEST_USER } from "./helpers/d1";

declare global {
  var __LOCAL_STACK__: LocalStack | undefined;
}

export default async function globalSetup(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  // Fail fast: if wrangler dies mid-suite the D1 proxy is gone and every
  // remaining Playwright spec will ECONNREFUSED for the rest of its timeout.
  // Exit with a bright header + log pointer so CI shows the real cause.
  setWorkerCrashHandler((message) => {
    console.error("");
    console.error("━━━ FATAL: wrangler dev crashed during L3 Playwright ━━━");
    console.error(message);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(`Full wrangler log: ${WRANGLER_LOG_PATH}`);
    process.exit(1);
  });

  console.log("[pw:global-setup] Starting local stack (wrangler dev + R2 shim)...");
  const stack = await startLocalStack();
  globalThis.__LOCAL_STACK__ = stack;

  applyLocalStackEnv();

  console.log("[pw:global-setup] Verifying _test_marker in local D1...");
  const rows = await queryD1<{ value: string }>("SELECT value FROM _test_marker WHERE key = 'env'");
  if (rows?.[0]?.value !== "test") {
    throw new Error(
      "FATAL: _test_marker check failed. Local stack did not seed the marker — " +
        "check scripts/test-stack.ts:seedTestMarker().",
    );
  }

  console.log("[pw:global-setup] Ensuring E2E test user exists in D1...");
  await executeD1(
    "INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)",
    [TEST_USER.id, TEST_USER.name, TEST_USER.email],
  );

  console.log("[pw:global-setup] Done.");
}
