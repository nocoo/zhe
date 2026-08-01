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
  flushLogStream,
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

  // Fail fast on wrangler crash. Ordered shutdown:
  //   1. Print the report so CI has it in stdout even if artifact upload
  //      races with process teardown.
  //   2. Await flushLogStream so `.test-storage/wrangler-dev.log` is fully on
  //      disk before the process exits — the CI `if: always()` artifact step
  //      would otherwise upload a truncated file.
  //   3. Send SIGINT to ourselves so Playwright's own signal handler runs
  //      globalTeardown, writes the HTML report, and kills its webServer.
  //      SIGINT (not process.exit) is what preserves the playwright-report
  //      artifact — a hard exit(1) here loses it.
  //   4. Set process.exitCode so the eventual exit is non-zero.
  setWorkerCrashHandler(async (message) => {
    console.error("");
    console.error("━━━ FATAL: wrangler dev crashed during L3 Playwright ━━━");
    console.error(message);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(`Full wrangler log: ${WRANGLER_LOG_PATH}`);
    const stack = globalThis.__LOCAL_STACK__;
    await flushLogStream(stack?.wranglerLogStream);
    process.exitCode = 1;
    // Playwright installs a SIGINT handler — this triggers its orderly
    // shutdown (write HTML report, run globalTeardown, kill webServer).
    process.kill(process.pid, "SIGINT");
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
