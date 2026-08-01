/**
 * Playwright global setup — start the local stack and verify test marker.
 *
 * No remote Cloudflare resources required. The wrangler dev subprocess and R2
 * filesystem shim live for the entire Playwright session; global-teardown
 * (same Node process) stops them.
 */
import { resolve } from "node:path";
import { shutdownL3 } from "../../scripts/lib/crash-shutdown";
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

  // Fail fast on wrangler crash — delegates the ordered shutdown to the
  // covered helper in scripts/lib/crash-shutdown.ts (see shutdownL3). The
  // helper flushes the tee log, sets process.exitCode = 1, and sends SIGINT
  // so Playwright's own signal handler runs globalTeardown + writes the HTML
  // report. Hard process.exit(1) here would lose the report artifact
  // (observed on run 30684740290).
  setWorkerCrashHandler(async (message) => {
    console.error("");
    console.error("━━━ FATAL: wrangler dev crashed during L3 Playwright ━━━");
    console.error(message);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(`Full wrangler log: ${WRANGLER_LOG_PATH}`);
    await shutdownL3({
      wranglerLogStream: globalThis.__LOCAL_STACK__?.wranglerLogStream,
      setExitCode: (code) => {
        process.exitCode = code;
      },
      signalPlaywright: () => process.kill(process.pid, "SIGINT"),
    });
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
