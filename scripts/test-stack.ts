/**
 * Local test stack launcher — replaces the remote zhe-edge-test + zhe-db-test
 * pair with `wrangler dev --local`, a Miniflare-managed SQLite/KV store, and
 * the local R2 filesystem shim.
 *
 * Layout (under .test-storage/):
 *   .test-storage/
 *     ├── wrangler/          # Miniflare persistence (D1 SQLite + KV)
 *     └── r2/                # filesystem R2 backend
 *
 * Exposes startLocalStack() / stopLocalStack() for callers (L2 runner and
 * Playwright globalSetup). The wrangler subprocess is reused for the entire
 * test session and torn down once on stop.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  promises as fs,
  readdirSync,
  readFileSync,
  type WriteStream,
} from "node:fs";
import { resolve as pathResolve } from "node:path";

import { type LocalR2Server, startLocalR2Server, stopLocalR2Server } from "./local-r2-server";

// Always resolved from cwd. The test harness (run-api-e2e.ts, Playwright
// globalSetup, manual `bun run scripts/test-stack.ts`) all launch from the
// project root, so this is stable. Avoids `import.meta.url`, which forces
// Node to treat this file as ESM and breaks Playwright's CJS TS loader.
export const PROJECT_ROOT = process.cwd();
export const STACK_DIR = pathResolve(PROJECT_ROOT, ".test-storage");
export const WRANGLER_PERSIST_DIR = pathResolve(STACK_DIR, "wrangler");
export const R2_DIR = pathResolve(STACK_DIR, "r2");
export const WRANGLER_LOG_PATH = pathResolve(STACK_DIR, "wrangler-dev.log");
export const WORKER_CONFIG = pathResolve(PROJECT_ROOT, "worker/wrangler.local.toml");
export const MIGRATIONS_DIR = pathResolve(PROJECT_ROOT, "drizzle/migrations");

export const WORKER_PORT = 8788;
export const R2_PORT = 18788;
export const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
export const R2_URL = `http://127.0.0.1:${R2_PORT}`;
export const WORKER_SECRET = "local-worker-secret";
export const D1_PROXY_SECRET = "local-d1-proxy-secret";

export const LOCAL_DB_NAME = "zhe-db-local";

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 200;

export function loadEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.indexOf(" #");
      if (commentIdx >= 0) value = value.slice(0, commentIdx).trim();
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ─── Migration loader ───────────────────────────────────────────────────────

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function runWrangler(args: string[], opts?: { ignoreFailure?: boolean }): void {
  const result = spawnSync("wrangler", args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (result.status !== 0 && !opts?.ignoreFailure) {
    const stderr = result.stderr?.toString() ?? "";
    const stdout = result.stdout?.toString() ?? "";
    throw new Error(
      `wrangler ${args.join(" ")} failed (exit ${result.status}):\n${stderr}\n${stdout}`,
    );
  }
}

function applyMigration(file: string): void {
  // A handful of historical migrations drop columns that were added by hand
  // in prod and never appear in any "ADD COLUMN" migration, so they fail on a
  // clean local database with "no such column". Skip the SQLite error — the
  // resulting schema matches prod after all migrations apply.
  const tolerateMissingColumn =
    file === "0014_drop_discord_bot_settings.sql" || file === "0016_drop_backy_pull_secret.sql";

  const result = spawnSync(
    "wrangler",
    [
      "d1",
      "execute",
      LOCAL_DB_NAME,
      "--local",
      `--persist-to=${WRANGLER_PERSIST_DIR}`,
      `--config=${WORKER_CONFIG}`,
      `--file=${pathResolve(MIGRATIONS_DIR, file)}`,
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );

  if (result.status === 0) return;

  const stderr = result.stderr?.toString() ?? "";
  const stdout = result.stdout?.toString() ?? "";
  if (tolerateMissingColumn && /no such column/i.test(stderr + stdout)) {
    console.log(`[test-stack] Skipping ${file} (column already absent on local schema)`);
    return;
  }
  throw new Error(
    `wrangler d1 execute --file=${file} failed (exit ${result.status}):\n${stderr}\n${stdout}`,
  );
}

function seedTestMarker(): void {
  runWrangler([
    "d1",
    "execute",
    LOCAL_DB_NAME,
    "--local",
    `--persist-to=${WRANGLER_PERSIST_DIR}`,
    `--config=${WORKER_CONFIG}`,
    "--command=CREATE TABLE IF NOT EXISTS _test_marker (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
  ]);
  runWrangler([
    "d1",
    "execute",
    LOCAL_DB_NAME,
    "--local",
    `--persist-to=${WRANGLER_PERSIST_DIR}`,
    `--config=${WORKER_CONFIG}`,
    "--command=INSERT OR REPLACE INTO _test_marker (key, value) VALUES ('env', 'test');",
  ]);
}

/**
 * Apply schema fixups for columns that exist in lib/db/schema.ts and in prod
 * but were added by hand and never written into drizzle/migrations/. Each
 * statement is idempotent (column-already-exists is swallowed).
 *
 * If a new prod-only column shows up: add it here AND open a migration so
 * `bun run release` (which diffs migration parity) stops yelling.
 */
function applySchemaFixups(): void {
  const fixups: string[] = ["ALTER TABLE analytics ADD COLUMN source TEXT"];
  for (const sql of fixups) {
    const result = spawnSync(
      "wrangler",
      [
        "d1",
        "execute",
        LOCAL_DB_NAME,
        "--local",
        `--persist-to=${WRANGLER_PERSIST_DIR}`,
        `--config=${WORKER_CONFIG}`,
        `--command=${sql}`,
      ],
      {
        cwd: PROJECT_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      },
    );
    if (result.status !== 0) {
      const out = (result.stderr?.toString() ?? "") + (result.stdout?.toString() ?? "");
      if (/duplicate column name/i.test(out)) continue;
      throw new Error(`Schema fixup failed: ${sql}\n${out}`);
    }
  }
}

// ─── Stack lifecycle ────────────────────────────────────────────────────────

export interface LocalStack {
  worker: ChildProcess;
  r2: LocalR2Server;
  /** Set by stopLocalStack() before SIGTERM so the exit handler stays quiet. */
  intentionalShutdown?: boolean;
  /** Absolute path to the full wrangler-dev.log for this run. */
  wranglerLogPath: string;
  /** Underlying write stream for the wrangler log; closed by stopLocalStack(). */
  wranglerLogStream?: WriteStream;
}

const STDERR_TAIL_LINES = 80;

/**
 * Called by the stack owner (Playwright globalSetup / run-api-e2e.ts) when the
 * wrangler subprocess dies mid-run. Test harnesses register this to convert an
 * otherwise silent "everything downstream ECONNREFUSEDs for 60s" into an
 * immediate hard failure — no test result is trustworthy once the D1 proxy is
 * gone. When left unset (e.g. CLI `bun run scripts/test-stack.ts`), the exit
 * report is still printed but the process is not killed.
 */
let workerCrashHandler: ((message: string) => void) | null = null;

export function setWorkerCrashHandler(handler: ((message: string) => void) | null): void {
  workerCrashHandler = handler;
}

/**
 * Default crash handler for CLI / test-runner processes: log a bright header
 * and exit with a non-zero code. Test suites can substitute their own handler
 * (see setWorkerCrashHandler) that throws or tears down a webServer first.
 */
export function defaultWorkerCrashHandler(message: string): void {
  console.error("");
  console.error("━━━ FATAL: wrangler dev subprocess died — aborting test run ━━━");
  console.error(message);
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(`Full wrangler log: ${WRANGLER_LOG_PATH}`);
  process.exit(1);
}

/**
 * Decide whether the wrangler exit should be reported and produce the
 * message lines to emit. Any exit that wasn't triggered by
 * stopLocalStack() is unexpected — code=0 with no signal is just as
 * lethal as a crash, because tests still lose the D1 proxy.
 */
export function formatWorkerExitReport(
  code: number | null,
  signal: NodeJS.Signals | null,
  intentionalShutdown: boolean,
  stderrTail: readonly string[],
  logTag = "[wrangler]",
): string[] | null {
  if (intentionalShutdown) return null;
  const header = `${logTag} exited unexpectedly (code=${code}, signal=${signal}). Last ${stderrTail.length} stderr line(s):`;
  return [header, ...stderrTail.map((line) => `${logTag}   ${line}`)];
}

async function waitForWorkerProxy(worker: ChildProcess): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null || worker.signalCode !== null) {
      throw new Error(
        `wrangler dev exited during startup (code=${worker.exitCode}, signal=${worker.signalCode}). See [wrangler] output above.`,
      );
    }
    try {
      const res = await fetch(`${WORKER_URL}/api/d1-query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${D1_PROXY_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: "SELECT 1 as ok", params: [] }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success) return;
      }
    } catch {
      // wrangler still booting
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(
    `Worker D1 proxy did not respond on ${WORKER_URL}/api/d1-query within ${HEALTH_TIMEOUT_MS / 1000}s`,
  );
}

export interface StartOptions {
  /** When true, log subprocess stdout/stderr to console. Defaults to false. */
  verbose?: boolean;
}

export async function startLocalStack(opts: StartOptions = {}): Promise<LocalStack> {
  // 1. Clean previous state
  await fs.rm(STACK_DIR, { recursive: true, force: true });
  await fs.mkdir(WRANGLER_PERSIST_DIR, { recursive: true });
  await fs.mkdir(R2_DIR, { recursive: true });

  // 2. Apply migrations
  const migrations = listMigrations();
  if (migrations.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }
  console.log(`[test-stack] Applying ${migrations.length} migration(s) to local D1...`);
  for (const file of migrations) {
    applyMigration(file);
  }
  seedTestMarker();
  applySchemaFixups();

  // 3. Start R2 shim
  console.log(`[test-stack] Starting local R2 shim on ${R2_URL}...`);
  process.env.LOCAL_R2_DIR = R2_DIR;
  process.env.LOCAL_R2_PORT = String(R2_PORT);
  const r2 = await startLocalR2Server(R2_PORT);

  // 4. Start wrangler dev
  console.log(`[test-stack] Starting wrangler dev on ${WORKER_URL}...`);
  console.log(`[test-stack] Full wrangler log → ${WRANGLER_LOG_PATH}`);
  const wranglerLogStream = createWriteStream(WRANGLER_LOG_PATH, { flags: "w" });
  wranglerLogStream.write(
    `# wrangler-dev.log — ${new Date().toISOString()}\n# WORKER_URL=${WORKER_URL}\n\n`,
  );
  const worker = spawn(
    "wrangler",
    [
      "dev",
      `--config=${WORKER_CONFIG}`,
      `--persist-to=${WRANGLER_PERSIST_DIR}`,
      `--port=${WORKER_PORT}`,
      "--ip=127.0.0.1",
      "--log-level=warn",
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );

  const logTag = "[wrangler]";
  const stderrTail: string[] = [];
  const stack: LocalStack = { worker, r2, wranglerLogPath: WRANGLER_LOG_PATH, wranglerLogStream };
  worker.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    wranglerLogStream.write(text);
    if (opts.verbose) console.log(`${logTag} ${text.trimEnd()}`);
  });
  worker.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    wranglerLogStream.write(text);
    const trimmed = text.trimEnd();
    if (!trimmed) return;
    for (const line of trimmed.split("\n")) {
      stderrTail.push(line);
      if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift();
    }
    if (opts.verbose || /error|warn/i.test(trimmed)) {
      console.log(`${logTag} ${trimmed}`);
    }
  });
  worker.once("exit", (code, signal) => {
    const lines = formatWorkerExitReport(
      code,
      signal,
      stack.intentionalShutdown === true,
      stderrTail,
      logTag,
    );
    if (!lines) return;
    for (const line of lines) console.error(line);
    // Fail fast: without the wrangler subprocess the D1 proxy is dead and every
    // downstream test now records ECONNREFUSED garbage. Kill the run instead
    // of letting Playwright / vitest keep going for the next 60s.
    const message = lines.join("\n");
    if (workerCrashHandler) {
      try {
        workerCrashHandler(message);
      } catch (err) {
        console.error(`${logTag} crash handler threw:`, err);
      }
    }
  });
  worker.once("error", (err) => {
    if (stack.intentionalShutdown) return;
    console.error(`${logTag} spawn error:`, err);
  });

  try {
    await waitForWorkerProxy(worker);
  } catch (err) {
    await stopLocalStack(stack);
    throw err;
  }

  console.log("[test-stack] Local stack ready.");
  return stack;
}

export async function stopLocalStack(stack: LocalStack | null): Promise<void> {
  if (!stack) return;
  console.log("[test-stack] Stopping local stack...");
  stack.intentionalShutdown = true;
  try {
    await stopLocalR2Server(stack.r2);
  } catch (err) {
    console.error("[test-stack] R2 shutdown error:", err);
  }
  if (stack.worker.exitCode === null) {
    stack.worker.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (stack.worker.exitCode === null) stack.worker.kill("SIGKILL");
        resolve();
      }, 5_000);
      stack.worker.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (stack.wranglerLogStream) {
    const stream = stack.wranglerLogStream;
    await new Promise<void>((resolve) => {
      stream.end(() => resolve());
    });
    delete stack.wranglerLogStream;
  }
}

/**
 * Override env vars so the Next.js dev server (and seed/teardown helpers)
 * point at the local stack. Returns nothing — mutates process.env in place.
 */
export function applyLocalStackEnv(): void {
  // R2: filesystem backend + local public domain
  process.env.LOCAL_R2 = "1";
  process.env.LOCAL_R2_DIR = R2_DIR;
  process.env.LOCAL_R2_PORT = String(R2_PORT);
  process.env.R2_BUCKET_NAME = "zhe-local";
  process.env.R2_PUBLIC_DOMAIN = `${R2_URL}/r2`;
  // Dummy R2 creds — getR2Config() throws on missing values even though the
  // S3 client is never constructed in LOCAL_R2 mode (defensive: keep the
  // fields populated so an accidental fallthrough surfaces immediately).
  process.env.R2_ACCESS_KEY_ID = "local-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "local-secret-key";
  process.env.R2_ENDPOINT = R2_URL;
  // actions/upload.ts + actions/links/screenshot.ts refuse to mint a
  // presigned URL without a salt. Mirror the value in playwright.config.ts
  // webServer.env so the Next dev subprocess sees it too.
  process.env.R2_USER_HASH_SALT = "local-test-salt";

  // D1 proxy: point at local wrangler dev
  process.env.D1_PROXY_URL = WORKER_URL;
  process.env.D1_PROXY_SECRET = D1_PROXY_SECRET;

  // KV: disable HTTP API (worker owns the local KV store; business code is a
  // no-op when CLOUDFLARE_KV_NAMESPACE_ID is unset). Worker KV correctness is
  // covered by worker/test/index.test.ts and L3 redirect specs.
  delete process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  // D1 REST API creds — only seed/teardown used these; the new helpers use
  // the worker proxy. Clear to surface any straggler that still calls the
  // REST API path.
  delete process.env.CLOUDFLARE_D1_DATABASE_ID;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;

  // Shared worker secret
  process.env.WORKER_SECRET = WORKER_SECRET;
}

// ─── CLI entry ──────────────────────────────────────────────────────────────
function runningAsScript(): boolean {
  return !!process.argv[1] && process.argv[1].endsWith("test-stack.ts");
}

if (runningAsScript()) {
  loadEnvFile(pathResolve(PROJECT_ROOT, ".env.local"));
  setWorkerCrashHandler(defaultWorkerCrashHandler);
  startLocalStack({ verbose: true })
    .then(() => {
      applyLocalStackEnv();
      console.log("");
      console.log(`  Worker:     ${WORKER_URL}`);
      console.log(`  D1 proxy:   ${WORKER_URL}/api/d1-query`);
      console.log(`  R2 shim:    ${R2_URL}/r2`);
      console.log(`  Persisted:  ${STACK_DIR}`);
      console.log("");
      console.log("Press Ctrl-C to stop.");
    })
    .catch((err) => {
      console.error("[test-stack] start failed:", err);
      process.exit(1);
    });
  const shutdown = () => process.exit(0);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
