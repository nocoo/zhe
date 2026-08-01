/**
 * Real-subprocess regression tests for the two-stage crash pipeline. Guards
 * the three properties Reviewer-01 flagged as blockers (STU-2287):
 *
 *   1. Fail-fast completes in seconds, not at the outer harness timeout.
 *   2. The very last line the child writes to stdout/stderr lands on disk
 *      before the crash handler is invoked.
 *   3. No child process is left running after the handler resolves.
 *
 * Tests spawn a real Node subprocess (no mocks) — this is the only shape
 * that catches the `exit`-vs-`close` timing bug where an earlier draft ran
 * the handler on `exit` and truncated the tail.
 */
import { spawn } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { attachWorkerCrashListeners, flushLogStream } from "@/scripts/test-stack";

// A tiny stub that writes exactly one large payload and one final marker to
// each stream, then exits with the given code. The stub explicitly waits for
// both streams to acknowledge the marker before calling process.exit so the
// bytes actually leave the child — we're testing the parent's close-vs-exit
// timing, NOT Node's own process.exit truncation behaviour on the child.
function stubScript(bytesPerStream: number, exitCode: number): string {
  return `
    const line = "x".repeat(63) + "\\n";
    const repeats = Math.ceil(${bytesPerStream} / line.length);
    const payload = line.repeat(repeats);
    process.stdout.write(payload);
    process.stderr.write(payload);
    let pending = 2;
    const done = () => { if (--pending === 0) process.exit(${exitCode}); };
    process.stdout.write("STDOUT_TAIL_MARKER\\n", done);
    process.stderr.write("STDERR_TAIL_MARKER\\n", done);
  `;
}

async function withTempLog<T>(fn: (path: string) => Promise<T>): Promise<T> {
  const path = join(
    tmpdir(),
    `test-stack-crash-${process.pid}-${Math.floor(performance.now())}.log`,
  );
  try {
    return await fn(path);
  } finally {
    await fs.rm(path, { force: true });
  }
}

const tracked: Array<ReturnType<typeof spawn>> = [];

afterEach(async () => {
  // Any child we forgot to reap is a bug in the test, but don't leak into the
  // next test — SIGKILL them all.
  for (const child of tracked.splice(0)) {
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

describe("attachWorkerCrashListeners (real subprocess)", () => {
  it("waits for stdio drain (close) before invoking the crash handler", async () => {
    // 512 KiB per stream is enough to force the OS pipe buffer to drain
    // across multiple `data` events but small enough to keep the test fast.
    // If the pipeline listens on `exit` instead of `close`, the marker
    // written just before process.exit gets lost.
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      const worker = spawn(process.execPath, ["-e", stubScript(512 * 1024, 1)], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      tracked.push(worker);
      const stderrTail: string[] = [];
      // Buffer stdio in memory as well so we can prove the WRITE side got
      // everything even if the on-disk copy loses trailing bytes for
      // orthogonal fs reasons.
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      worker.stdout?.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        stream.write(chunk);
      });
      worker.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
        stream.write(chunk);
        for (const line of chunk.toString().split("\n")) {
          if (line) stderrTail.push(line);
        }
      });

      const start = performance.now();
      const crashed = new Promise<{
        message: string;
        elapsedMs: number;
        stdoutEnded: boolean;
        stderrEnded: boolean;
      }>((resolve) => {
        attachWorkerCrashListeners({
          worker,
          stderrTail,
          isIntentionalShutdown: () => false,
          onCrash: async (message) => {
            // Snapshot the stream state at handler-fire time. If the pipeline
            // listened on `exit` instead of `close`, these would still be
            // false when the handler ran — which is exactly the regression
            // this whole test exists to catch.
            const stdoutEnded = worker.stdout?.readableEnded ?? true;
            const stderrEnded = worker.stderr?.readableEnded ?? true;
            await flushLogStream(stream);
            resolve({
              message,
              elapsedMs: performance.now() - start,
              stdoutEnded,
              stderrEnded,
            });
          },
        });
      });

      const { message, elapsedMs, stdoutEnded, stderrEnded } = await crashed;
      const contents = await fs.readFile(logPath, "utf-8");
      const stdoutJoined = Buffer.concat(stdoutChunks).toString();
      const stderrJoined = Buffer.concat(stderrChunks).toString();

      // 1. The tail markers were fully received on the pipe side.
      expect(stdoutJoined).toContain("STDOUT_TAIL_MARKER");
      expect(stderrJoined).toContain("STDERR_TAIL_MARKER");
      // 2. Both streams had already drained when the crash handler fired.
      //    This is what proves the listener attached to `close`, not `exit`.
      expect(stdoutEnded).toBe(true);
      expect(stderrEnded).toBe(true);
      // 3. And the markers made it through to the on-disk log stream.
      expect(contents).toContain("STDOUT_TAIL_MARKER");
      expect(contents).toContain("STDERR_TAIL_MARKER");
      // 4. The stderr tail buffer preserved a line ending with the marker
      //    so formatWorkerExitReport can print it.
      expect(stderrTail.at(-1)).toBe("STDERR_TAIL_MARKER");
      // 5. The report identifies this as the unexpected exit path.
      expect(message).toContain("(code=1, signal=null)");
      expect(message).toContain("STDERR_TAIL_MARKER");
      // 6. Fail-fast: this is seconds, not 60s of ECONNREFUSED noise.
      expect(elapsedMs).toBeLessThan(5_000);
      // 7. The child has been fully reaped, not left dangling.
      expect(worker.exitCode).toBe(1);
    });
  });

  it("does NOT run the crash handler on intentional shutdown", async () => {
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      const worker = spawn(process.execPath, ["-e", stubScript(1024, 0)], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      tracked.push(worker);
      worker.stdout?.on("data", (c) => stream.write(c));
      worker.stderr?.on("data", (c) => stream.write(c));

      let handlerCalled = false;
      attachWorkerCrashListeners({
        worker,
        stderrTail: [],
        // Simulates stopLocalStack() having flipped the intentional flag.
        isIntentionalShutdown: () => true,
        onCrash: () => {
          handlerCalled = true;
        },
      });

      await new Promise<void>((resolve) => worker.once("close", () => resolve()));
      await flushLogStream(stream);
      expect(handlerCalled).toBe(false);
    });
  });

  it("logs but does not throw when the crash handler itself errors", async () => {
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      const worker = spawn(process.execPath, ["-e", stubScript(4096, 2)], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      tracked.push(worker);
      worker.stdout?.on("data", (c) => stream.write(c));
      worker.stderr?.on("data", (c) => stream.write(c));

      // The listener wraps the handler in a Promise.catch — if it didn't,
      // this test would produce an unhandledRejection and vitest would fail.
      attachWorkerCrashListeners({
        worker,
        stderrTail: [],
        isIntentionalShutdown: () => false,
        onCrash: async () => {
          throw new Error("bad handler");
        },
      });

      await new Promise<void>((resolve) => worker.once("close", () => resolve()));
      await flushLogStream(stream);
      // Give the microtask queue a beat so the caught rejection lands.
      await new Promise((r) => setTimeout(r, 10));
      expect(worker.exitCode).toBe(2);
    });
  });

  it("waits for pipes to close (not just process exit) before firing", async () => {
    // The bug this catches: listening on `exit` instead of `close`. Force the
    // child to dribble output on a timer so the stderr tail buffer captures
    // multiple lines, and assert the pipes had drained (readableEnded=true)
    // by the time onCrash fires.
    await withTempLog(async (logPath) => {
      const stream = createWriteStream(logPath, { flags: "w" });
      const dribbleScript = `
        let n = 0;
        const iv = setInterval(() => {
          process.stderr.write("line" + n + "\\n");
          if (++n === 20) {
            clearInterval(iv);
            process.stderr.write("STDERR_TAIL_MARKER\\n", () => process.exit(3));
          }
        }, 2);
      `;
      const worker = spawn(process.execPath, ["-e", dribbleScript], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      tracked.push(worker);
      const stderrTail: string[] = [];
      worker.stdout?.on("data", (c) => stream.write(c));
      worker.stderr?.on("data", (c: Buffer) => {
        stream.write(c);
        for (const line of c.toString().split("\n")) {
          if (line) stderrTail.push(line);
        }
      });

      const crashed = new Promise<{
        stdoutEnded: boolean;
        stderrEnded: boolean;
      }>((resolve) => {
        attachWorkerCrashListeners({
          worker,
          stderrTail,
          isIntentionalShutdown: () => false,
          onCrash: async () => {
            const stdoutEnded = worker.stdout?.readableEnded ?? true;
            const stderrEnded = worker.stderr?.readableEnded ?? true;
            await flushLogStream(stream);
            resolve({ stdoutEnded, stderrEnded });
          },
        });
      });

      const { stdoutEnded, stderrEnded } = await crashed;
      expect(stdoutEnded).toBe(true);
      expect(stderrEnded).toBe(true);
      expect(stderrTail.at(-1)).toBe("STDERR_TAIL_MARKER");
      // The dribble ran ~40 ms in the child; the handler must not have raced
      // ahead of the tail write.
      expect(stderrTail.length).toBeGreaterThan(5);
    });
  });
});
