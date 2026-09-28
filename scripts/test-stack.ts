import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  promises as fs,
  readdirSync,
  readFileSync,
  type WriteStream,
} from "node:fs";
import { resolve as pathResolve } from "node:path";
import { lockDemo, unlockDemo } from "./lib/demo-storage";
import { createRun, localRunId, removeRun, runDirectory } from "./lib/local-run";
import { migrationBatches, OPTIONAL_LOCAL_MIGRATIONS } from "./lib/migration-batches";

// Always resolved from cwd. The test harness (run-api-e2e.ts, Playwright
// globalSetup and the interactive launcher) all launch from the
// project root, so this is stable. Avoids `import.meta.url`, which forces
// Node to treat this file as ESM and breaks Playwright's CJS TS loader.
export const PROJECT_ROOT = process.cwd();
export const RUN_ID = localRunId();
export const DEMO_MODE = process.env.ZHE_ENVIRONMENT === "demo";
export const STACK_DIR = DEMO_MODE
  ? pathResolve(PROJECT_ROOT, ".demo-storage")
  : runDirectory(PROJECT_ROOT, RUN_ID);
export const WRANGLER_PERSIST_DIR = pathResolve(STACK_DIR, "wrangler");
/** Our own tee of wrangler stdout/stderr — captured by piping from the child. */
export const WRANGLER_LOG_PATH = pathResolve(STACK_DIR, "wrangler-dev.log");
/**
 * Directory we hand to wrangler via the `WRANGLER_LOG_PATH` env var so its
 * internal timestamped logs land under `.test-storage/` instead of the runner
 * home dir (`~/.config/.wrangler/logs`). CI can then upload this directory as
 * an artifact. The env-var name here is Wrangler's, NOT our tee path constant.
 */
export const WRANGLER_INTERNAL_LOGS_DIR = pathResolve(STACK_DIR, "wrangler-internal-logs");
export const WORKER_CONFIG = pathResolve(STACK_DIR, "wrangler.toml");
export const MIGRATIONS_DIR = pathResolve(PROJECT_ROOT, "drizzle/migrations");

export const WORKER_PORT = Number(process.env.ZHE_TEST_WORKER_PORT ?? 8788);
export const R2_PORT = WORKER_PORT;
export const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
export const R2_URL = `http://127.0.0.1:${R2_PORT}`;
export const WORKER_SECRET = "local-worker-secret";
export const D1_PROXY_SECRET = "local-d1-proxy-secret";

export const LOCAL_DB_NAME = "zhe-db-local";

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 200;

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
  const tolerateMissingColumn = OPTIONAL_LOCAL_MIGRATIONS.has(file);

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

// ─── Stack lifecycle ────────────────────────────────────────────────────────

export interface LocalStack {
  worker: ChildProcess;
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
 * wrangler subprocess dies mid-run. The stack owner installs an async handler
 * that MUST await the returned promise before calling process.exit() so the
 * wrangler-dev.log write stream, playwright report, and downstream
 * subprocesses have time to flush / be killed. Synchronous handlers work but
 * are treated as fire-and-forget.
 *
 * When left unset, the exit report
 * is still printed but the process is not killed.
 */
let workerCrashHandler: ((message: string) => void | Promise<void>) | null = null;

export function setWorkerCrashHandler(
  handler: ((message: string) => void | Promise<void>) | null,
): void {
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
 * Wire the two-stage crash pipeline described below onto a spawned child +
 * write stream. Exported so tests can exercise the exact same code path
 * against a real subprocess without booting the whole test-stack.
 *
 *   1. `exit` fires FIRST, before stdio drains. We only capture the exit
 *      code/signal here — invoking the crash handler now would truncate
 *      the last stderr line (a ~20 MB pipe experiment showed tail loss on
 *      close-before-drain). Do not exit yet.
 *   2. `close` fires AFTER stdout+stderr have fully closed. That is when we
 *      have the complete crash tail on disk (via the write stream), so run
 *      the handler and let it perform an ordered shutdown.
 *
 * The handler is expected to await `flushLogStream(logStream)` before its
 * own `process.exit(1)`. Errors from the handler are logged so a buggy
 * handler cannot silence the crash.
 */
export function attachWorkerCrashListeners(opts: {
  worker: ChildProcess;
  stderrTail: readonly string[];
  isIntentionalShutdown: () => boolean;
  logTag?: string;
  onCrash: (message: string) => void | Promise<void>;
}): void {
  const { worker, stderrTail, isIntentionalShutdown, onCrash } = opts;
  const logTag = opts.logTag ?? "[wrangler]";
  let capturedExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  worker.once("exit", (code, signal) => {
    capturedExit = { code, signal };
  });
  worker.once("close", () => {
    const exit = capturedExit ?? { code: null, signal: null };
    const lines = formatWorkerExitReport(
      exit.code,
      exit.signal,
      isIntentionalShutdown(),
      stderrTail,
      logTag,
    );
    if (!lines) return;
    for (const line of lines) console.error(line);
    const message = lines.join("\n");
    Promise.resolve()
      .then(() => onCrash(message))
      .catch((err) => {
        console.error(`${logTag} crash handler threw:`, err);
      });
  });
}

/**
 * Wait for a log stream to finish flushing to disk. Callers use this before
 * process.exit() to guarantee the tail lines the crash handler prints are
 * durable on disk, not just in Node's write buffer.
 */
export async function flushLogStream(stream: WriteStream | undefined): Promise<void> {
  if (!stream) return;
  await new Promise<void>((resolve) => {
    // Node's WriteStream.end(cb) fires after the FS finishes flushing.
    stream.end(() => resolve());
  });
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
  const production = readFileSync(pathResolve(PROJECT_ROOT, "worker/wrangler.toml"), "utf8");
  const local = readFileSync(pathResolve(PROJECT_ROOT, "worker/wrangler.local.toml"), "utf8");
  for (const key of ["compatibility_date", "compatibility_flags"]) {
    const pattern = new RegExp(`^${key}\\s*=\\s*("[^"\\n]*"|\\[[\\s\\S]*?\\])`, "m");
    if (production.match(pattern)?.[1] !== local.match(pattern)?.[1])
      throw new Error(`Local Worker ${key} differs from production`);
  }
  if (DEMO_MODE) await lockDemo(PROJECT_ROOT, RUN_ID);
  else await createRun(PROJECT_ROOT, RUN_ID);
  const config = local
    .replace(
      'main = "src/index.ts"',
      `main = ${JSON.stringify(pathResolve(PROJECT_ROOT, "worker/src/local-resources.ts"))}`,
    )
    .replace(
      'ORIGIN_URL = "http://127.0.0.1:17006"',
      `ORIGIN_URL = "http://127.0.0.1:${process.env.ZHE_LOCAL_APP_PORT || process.env.ZHE_TEST_APP_PORT || 17006}"`,
    );
  await fs.writeFile(
    WORKER_CONFIG,
    `${config}\n[[r2_buckets]]\nbinding = "LOCAL_BUCKET"\nbucket_name = "zhe-local"\n`,
  );
  await fs.mkdir(WRANGLER_PERSIST_DIR, { recursive: true });
  await fs.mkdir(WRANGLER_INTERNAL_LOGS_DIR, { recursive: true });

  // 2. Apply migrations
  const allMigrations = listMigrations();
  const ledger = pathResolve(STACK_DIR, "migrations.json");
  let applied: string[] = [];
  try {
    applied = JSON.parse(await fs.readFile(ledger, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const migrations = allMigrations.filter((file) => !applied.includes(file));
  if (allMigrations.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }
  console.log(`[test-stack] Applying ${migrations.length} migration(s) to local D1...`);
  for (const [index, files] of migrationBatches(migrations).entries()) {
    if (files.length === 1 && files[0]) {
      applyMigration(files[0]);
    } else {
      const batchPath = pathResolve(STACK_DIR, `migration-batch-${index}.sql`);
      await fs.writeFile(
        batchPath,
        files.map((file) => readFileSync(pathResolve(MIGRATIONS_DIR, file), "utf8")).join("\n"),
      );
      applyMigration(batchPath);
    }
  }
  seedTestMarker();
  await fs.writeFile(ledger, JSON.stringify(allMigrations));

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
      "--local",
      `--config=${WORKER_CONFIG}`,
      `--persist-to=${WRANGLER_PERSIST_DIR}`,
      `--port=${WORKER_PORT}`,
      "--ip=127.0.0.1",
      "--log-level=warn",
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      // WRANGLER_LOG_PATH points wrangler at a project-owned directory so its
      // timestamped internal logs (default ~/.config/.wrangler/logs/) land
      // under .test-storage/ and can be uploaded as a CI artifact.
      // WRANGLER_LOG=debug maximises what the internal log captures for
      // post-mortem — it does not affect our warn-level stdout tee.
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: WRANGLER_INTERNAL_LOGS_DIR,
        WRANGLER_LOG: "debug",
      },
    },
  );

  const logTag = "[wrangler]";
  const stderrTail: string[] = [];
  const stack: LocalStack = { worker, wranglerLogPath: WRANGLER_LOG_PATH, wranglerLogStream };
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
  // Two-stage crash pipeline (see attachWorkerCrashListeners). The startup
  // function OWNS the log stream lifecycle: even if wrangler dies before
  // `startLocalStack` returns (so callers have no `stack` handle to reach the
  // stream from their own crash handler), the listener below still flushes
  // the tee log before delegating to the caller-registered handler. This
  // guarantees CI artifacts capture the tail regardless of when the crash
  // fires.
  attachWorkerCrashListeners({
    worker,
    stderrTail,
    isIntentionalShutdown: () => stack.intentionalShutdown === true,
    logTag,
    onCrash: async (message) => {
      // Always flush our tee log first — the caller handler may or may not
      // still have access to `stack`.
      if (stack.wranglerLogStream) {
        const stream = stack.wranglerLogStream;
        // Remove the reference so stopLocalStack() does not try to double-end
        // the stream during teardown.
        delete stack.wranglerLogStream;
        try {
          await flushLogStream(stream);
        } catch (err) {
          console.error(`${logTag} log flush error:`, err);
        }
      }
      if (!workerCrashHandler) return;
      await workerCrashHandler(message);
    },
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

export async function stopLocalStack(stack: LocalStack | null, cleanup = false): Promise<void> {
  if (!stack) return;
  console.log("[test-stack] Stopping local stack...");
  stack.intentionalShutdown = true;
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
    await flushLogStream(stream);
    delete stack.wranglerLogStream;
  }
  if (!DEMO_MODE) {
    const evidence = pathResolve(PROJECT_ROOT, ".artifacts/e2e", RUN_ID);
    await fs.mkdir(evidence, { recursive: true });
    await fs.copyFile(WRANGLER_LOG_PATH, pathResolve(evidence, "wrangler.log"));
    await fs.cp(WRANGLER_INTERNAL_LOGS_DIR, pathResolve(evidence, "wrangler-internal-logs"), {
      recursive: true,
    });
  }
  if (DEMO_MODE) await unlockDemo(PROJECT_ROOT, RUN_ID);
  if (cleanup && !DEMO_MODE) await removeRun(PROJECT_ROOT, RUN_ID);
}

/**
 * Override env vars so the Next.js dev server (and seed/teardown helpers)
 * point at the local stack. Returns nothing — mutates process.env in place.
 */
export function applyLocalStackEnv(): void {
  // Local provider boundary backed by native R2 bindings.
  process.env.LOCAL_R2 = "1";
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

  process.env.CLOUDFLARE_KV_NAMESPACE_ID = "local";
  // D1 REST API creds — only seed/teardown used these; the new helpers use
  // the worker proxy. Clear to surface any straggler that still calls the
  // REST API path.
  delete process.env.CLOUDFLARE_D1_DATABASE_ID;
  process.env.CLOUDFLARE_ACCOUNT_ID = "local";
  process.env.CLOUDFLARE_API_BASE_URL = WORKER_URL;
  process.env.CLOUDFLARE_API_TOKEN = D1_PROXY_SECRET;

  // Shared worker secret
  process.env.WORKER_SECRET = WORKER_SECRET;
}
