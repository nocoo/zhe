/**
 * Ordered shutdown helpers shared by the L2/L3 crash paths. Extracted so the
 * fault-injection test suite in `tests/unit/lib/test-stack-crash-*` can
 * exercise the exact contract the L2 runner and Playwright globalSetup call
 * into, instead of just asserting the wrangler stub itself was reaped.
 *
 * These helpers are pure functions of the passed-in child handles / streams —
 * they do not read module state, so tests can spin up real subprocesses,
 * hand them here, and check the observable effects (exit codes, log flushes)
 * on the way out.
 */
import type { ChildProcess } from "node:child_process";
import type { WriteStream } from "node:fs";

import { flushLogStream } from "../test-stack";

/**
 * SIGTERM the child, wait for `close`, escalate to SIGKILL after `timeoutMs`.
 * Resolves once the child is reaped OR the escalation grace expires.
 * Idempotent when the child has already exited.
 */
export function terminateChild(
  child: ChildProcess | null | undefined,
  timeoutMs = 3_000,
): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      // A short grace period so `close` can still fire after SIGKILL.
      setTimeout(resolve, 250);
    }, timeoutMs);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export interface L2Shutdown {
  vitestChild: ChildProcess | null | undefined;
  server: ChildProcess | null | undefined;
  wranglerLogStream: WriteStream | undefined;
}

/**
 * Ordered shutdown for the L2 fail-fast path:
 *   1. SIGTERM+wait vitest so ECONNREFUSED noise stops.
 *   2. SIGTERM+wait the Next.js dev server the runner spawned.
 *   3. Flush the wrangler tee log so its tail is durable on disk.
 * The three steps run in parallel — nothing depends on the ordering between
 * them, and `Promise.allSettled` guarantees a slow step cannot mask a bug in
 * a faster one.
 */
export async function shutdownL2({
  vitestChild,
  server,
  wranglerLogStream,
}: L2Shutdown): Promise<void> {
  const shutdowns: Array<Promise<unknown>> = [];
  shutdowns.push(terminateChild(vitestChild));
  shutdowns.push(terminateChild(server));
  if (wranglerLogStream) shutdowns.push(flushLogStream(wranglerLogStream));
  await Promise.allSettled(shutdowns);
}

export interface L3Shutdown {
  wranglerLogStream: WriteStream | undefined;
  /**
   * Signal delivery point. Injected so tests can supply a spy — production
   * passes `() => process.kill(process.pid, "SIGINT")`.
   */
  signalPlaywright: () => void;
  /** Where to write process.exitCode = 1. Injected the same way. */
  setExitCode: (code: number) => void;
}

/**
 * Ordered shutdown for the L3 fail-fast path. Playwright installs its own
 * SIGINT handler that runs globalTeardown, writes the HTML report, and kills
 * the webServer — a hard `process.exit(1)` here would skip all of that, and
 * on run 30684740290 that is what discarded the report artifact.
 *
 *   1. Flush the wrangler tee log so its tail lands on disk.
 *   2. Set process.exitCode so the eventual exit is non-zero.
 *   3. Deliver SIGINT so Playwright's own shutdown path runs.
 */
export async function shutdownL3({
  wranglerLogStream,
  signalPlaywright,
  setExitCode,
}: L3Shutdown): Promise<void> {
  if (wranglerLogStream) await flushLogStream(wranglerLogStream);
  setExitCode(1);
  signalPlaywright();
}
