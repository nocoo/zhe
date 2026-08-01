import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultWorkerCrashHandler,
  formatWorkerExitReport,
  setWorkerCrashHandler,
  WRANGLER_LOG_PATH,
} from "@/scripts/test-stack";

describe("formatWorkerExitReport", () => {
  const tail = ["boot line 1", "final error line"];

  it("returns null on intentional shutdown", () => {
    expect(formatWorkerExitReport(0, null, true, tail)).toBeNull();
    expect(formatWorkerExitReport(1, "SIGTERM", true, tail)).toBeNull();
  });

  it("reports clean exit (code=0, signal=null) as unexpected", () => {
    const lines = formatWorkerExitReport(0, null, false, tail);
    expect(lines).not.toBeNull();
    expect(lines?.[0]).toContain("(code=0, signal=null)");
    expect(lines?.[0]).toContain(`Last ${tail.length} stderr line(s)`);
    expect(lines?.slice(1)).toEqual(["[wrangler]   boot line 1", "[wrangler]   final error line"]);
  });

  it("reports non-zero exit with stderr tail", () => {
    const lines = formatWorkerExitReport(1, null, false, tail);
    expect(lines?.[0]).toContain("(code=1, signal=null)");
    expect(lines?.length).toBe(1 + tail.length);
  });

  it("reports signal exit with stderr tail", () => {
    const lines = formatWorkerExitReport(null, "SIGKILL", false, tail);
    expect(lines?.[0]).toContain("(code=null, signal=SIGKILL)");
    expect(lines?.length).toBe(1 + tail.length);
  });

  it("still reports when stderr tail is empty", () => {
    const lines = formatWorkerExitReport(0, null, false, []);
    expect(lines).toEqual([
      "[wrangler] exited unexpectedly (code=0, signal=null). Last 0 stderr line(s):",
    ]);
  });

  it("honors custom log tag", () => {
    const lines = formatWorkerExitReport(1, null, false, ["x"], "[custom]");
    expect(lines?.[0]).toMatch(/^\[custom\] /);
    expect(lines?.[1]).toBe("[custom]   x");
  });
});

describe("setWorkerCrashHandler + defaultWorkerCrashHandler", () => {
  afterEach(() => {
    setWorkerCrashHandler(null);
    vi.restoreAllMocks();
  });

  it("setWorkerCrashHandler(null) clears without throwing (round-trip)", () => {
    // The setter is symmetric — an already-null handler is a no-op, and
    // installing then clearing is what test suites do in afterEach.
    expect(() => setWorkerCrashHandler(() => {})).not.toThrow();
    expect(() => setWorkerCrashHandler(null)).not.toThrow();
    expect(() => setWorkerCrashHandler(null)).not.toThrow();
  });

  it("defaultWorkerCrashHandler prints a header + points at the wrangler log + exits 1", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("__exited__");
    }) as never);

    expect(() => defaultWorkerCrashHandler("boom")).toThrow("__exited__");
    expect(exitSpy).toHaveBeenCalledWith(1);
    const messages = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(messages).toContain("FATAL: wrangler dev subprocess died");
    expect(messages).toContain("boom");
    expect(messages).toContain(WRANGLER_LOG_PATH);
  });
});
