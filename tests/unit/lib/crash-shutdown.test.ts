/**
 * End-to-end fault-injection tests for the L2/L3 crash-shutdown helpers used
 * by run-api-e2e.ts and tests/playwright/global-setup.ts. The previous suite
 * only proved the wrangler stub itself was reaped — Reviewer-01 pointed out
 * that we never actually triggered the L2 vitest/Next cleanup, nor the L3
 * SIGINT / globalTeardown / report path.
 *
 * These tests spawn real Node subprocesses to stand in for vitest, Next, and
 * Playwright's SIGINT-handling parent, and assert the shutdown helpers do
 * exactly what the L2/L3 crash handlers claim:
 *
 *   L2: SIGTERM the vitest child, SIGTERM the Next dev server, flush the tee
 *       log — all three complete before the helper returns.
 *   L3: Flush the log, set process.exitCode, deliver SIGINT so Playwright's
 *       own shutdown runs (and NOT a hard process.exit that skips it).
 */
import { spawn } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { shutdownL2, shutdownL3, terminateChild } from "@/scripts/lib/crash-shutdown";

const CHILDREN: Array<ReturnType<typeof spawn>> = [];

afterEach(async () => {
  for (const child of CHILDREN.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_000);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
});

async function spawnLongLivedChild(sigtermExitCode = 0): Promise<ReturnType<typeof spawn>> {
  // A tiny script that installs a SIGTERM handler and exits gracefully, so
  // `terminateChild` walks its happy path (no escalation to SIGKILL). We
  // exercise the escalation branch in a separate test below. The child prints
  // "ready\n" AFTER installing the handler so the test waits for that before
  // killing — otherwise SIGTERM can land before the handler is armed and the
  // OS kills the process with a null exit code (raced under vitest+bun).
  const script = `
    process.on("SIGTERM", () => process.exit(${sigtermExitCode}));
    process.stdout.write("ready\\n");
    setInterval(() => {}, 10_000);
  `;
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  CHILDREN.push(child);
  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      if (chunk.toString().includes("ready")) {
        child.stdout?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.once("error", reject);
    // Safety cap so a broken stub cannot hang the entire suite.
    setTimeout(() => reject(new Error("child never signalled ready")), 3_000);
  });
  return child;
}

async function spawnStubbornChild(): Promise<ReturnType<typeof spawn>> {
  // Ignores SIGTERM entirely — forces terminateChild to escalate to SIGKILL.
  const script = `
    process.on("SIGTERM", () => {});
    process.stdout.write("ready\\n");
    setInterval(() => {}, 10_000);
  `;
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  CHILDREN.push(child);
  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      if (chunk.toString().includes("ready")) {
        child.stdout?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.once("error", reject);
    setTimeout(() => reject(new Error("child never signalled ready")), 3_000);
  });
  return child;
}

async function withTempLog<T>(fn: (path: string) => Promise<T>): Promise<T> {
  const path = join(tmpdir(), `crash-shutdown-${process.pid}-${Math.floor(performance.now())}.log`);
  try {
    return await fn(path);
  } finally {
    await fs.rm(path, { force: true });
  }
}

describe("terminateChild", () => {
  it("SIGTERMs a child and returns once it closes", async () => {
    const child = await spawnLongLivedChild(0);
    const start = performance.now();
    await terminateChild(child);
    expect(performance.now() - start).toBeLessThan(3_000);
    // Child listened for SIGTERM and cleanly `process.exit(0)`d.
    expect(child.exitCode).toBe(0);
  });

  it("escalates to SIGKILL when SIGTERM is ignored", async () => {
    const child = await spawnStubbornChild();
    const start = performance.now();
    await terminateChild(child, 200);
    // The 200 ms SIGTERM window elapses, we SIGKILL, then wait ~250 ms grace.
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(2_000);
    // The child was killed by SIGKILL: no exit code, signalCode is SIGKILL.
    expect(child.signalCode).toBe("SIGKILL");
    expect(child.exitCode).toBeNull();
  });

  it("is idempotent on an already-exited child", async () => {
    const child = await spawnLongLivedChild(0);
    await terminateChild(child);
    const firstExit = child.exitCode;
    // Second call must not hang or throw.
    await terminateChild(child);
    expect(child.exitCode).toBe(firstExit);
    expect(firstExit).toBe(0);
  });

  it("no-ops on null / undefined", async () => {
    await terminateChild(null);
    await terminateChild(undefined);
  });
});

describe("shutdownL2 (fault-injected)", () => {
  it("kills vitest + Next server AND flushes the tee log before returning", async () => {
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      const vitest = await spawnLongLivedChild(0);
      const server = await spawnLongLivedChild(0);
      // Pre-fill the stream with a tail marker so we can prove the flush ran.
      stream.write("PRE_FLUSH_TAIL_MARKER\n");

      const start = performance.now();
      await shutdownL2({ vitestChild: vitest, server, wranglerLogStream: stream });
      const elapsedMs = performance.now() - start;

      // 1. Both downstream children reaped, not left dangling.
      expect(vitest.exitCode).toBe(0);
      expect(server.exitCode).toBe(0);
      // 2. Tee log fully flushed to disk (final line survived through end()).
      const contents = await fs.readFile(logPath, "utf-8");
      expect(contents).toContain("PRE_FLUSH_TAIL_MARKER");
      // 3. Fail-fast: seconds, not minutes.
      expect(elapsedMs).toBeLessThan(4_000);
    });
  });

  it("still flushes the tee log when neither child was spawned", async () => {
    // Startup-time crashes: the wrangler subprocess dies before the runner
    // has a chance to fork vitest / Next. shutdownL2 must still flush.
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      stream.write("STARTUP_CRASH_MARKER\n");

      await shutdownL2({
        vitestChild: null,
        server: null,
        wranglerLogStream: stream,
      });

      const contents = await fs.readFile(logPath, "utf-8");
      expect(contents).toContain("STARTUP_CRASH_MARKER");
    });
  });

  it("does not throw when there is nothing to shut down", async () => {
    await shutdownL2({
      vitestChild: null,
      server: null,
      wranglerLogStream: undefined,
    });
  });

  it("escalates a stubborn vitest to SIGKILL without hanging the run", async () => {
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      const stubborn = await spawnStubbornChild();

      const start = performance.now();
      await shutdownL2({
        vitestChild: stubborn,
        server: null,
        wranglerLogStream: stream,
      });
      // 3s SIGTERM window (terminateChild default) + 250 ms grace + slack.
      expect(performance.now() - start).toBeLessThan(5_000);
      expect(stubborn.signalCode).toBe("SIGKILL");
    });
  });
});

describe("shutdownL3 (fault-injected)", () => {
  it("flushes the log THEN sets exit code AND signals Playwright", async () => {
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      stream.write("L3_TAIL_MARKER\n");

      let exitCodeSetTo: number | undefined;
      let signalDeliveredAt = 0;
      let logFlushedBeforeSignal = false;

      await shutdownL3({
        wranglerLogStream: stream,
        setExitCode: (code) => {
          exitCodeSetTo = code;
        },
        signalPlaywright: () => {
          signalDeliveredAt = performance.now();
          // The stream must be `end()`-ed / drained BEFORE the signal fires
          // in production, because Playwright's SIGINT handler starts tearing
          // down the process immediately.
          logFlushedBeforeSignal = stream.writableEnded;
        },
      });

      expect(exitCodeSetTo).toBe(1);
      expect(signalDeliveredAt).toBeGreaterThan(0);
      expect(logFlushedBeforeSignal).toBe(true);
      const contents = await fs.readFile(logPath, "utf-8");
      expect(contents).toContain("L3_TAIL_MARKER");
    });
  });

  it("does NOT call process.exit — Playwright must run its own teardown", async () => {
    // Regression guard for the run-30684740290 pattern: a hard process.exit
    // in the L3 crash path discards the playwright-report artifact. shutdownL3
    // must reach the caller-supplied signalPlaywright spy WITHOUT going
    // through process.exit. We can prove this by observing that the promise
    // resolves normally — the test process itself is still alive after
    // awaiting the helper.
    let hardExitObserved = false;
    const originalExit = process.exit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.exit = ((code?: number): never => {
      hardExitObserved = true;
      // Do NOT actually exit; just record and throw a marker so the caller
      // notices something abnormal.
      throw new Error(`process.exit called with code=${code}`);
    }) as never;
    try {
      await shutdownL3({
        wranglerLogStream: undefined,
        setExitCode: () => {},
        signalPlaywright: () => {},
      });
    } finally {
      process.exit = originalExit;
    }
    expect(hardExitObserved).toBe(false);
  });

  it("tolerates a missing log stream (startup-time crash)", async () => {
    let signaled = false;
    await shutdownL3({
      wranglerLogStream: undefined,
      setExitCode: () => {},
      signalPlaywright: () => {
        signaled = true;
      },
    });
    expect(signaled).toBe(true);
  });
});
