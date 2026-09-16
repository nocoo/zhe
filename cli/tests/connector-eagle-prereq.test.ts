import { execFile } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { checkEaglePrerequisites, EagleSidecar } from "../src/connector/eagle.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it("checks Python native APIs and both media tools before enabling", async () => {
  vi.mocked(execFile).mockImplementation(((
    _command: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, result?: string) => void,
  ) => callback(null, "ok")) as any);
  await expect(checkEaglePrerequisites()).resolves.toBeUndefined();
  expect(vi.mocked(execFile).mock.calls.map(([command]) => command)).toEqual([
    "python3",
    "ffmpeg",
    "ffprobe",
  ]);
});
it("provides an actionable error and pauses only the sidecar on a missing prerequisite", async () => {
  vi.mocked(execFile).mockImplementation(((
    _command: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, result?: string) => void,
  ) => callback(new Error("ENOENT private path"))) as any);
  await expect(checkEaglePrerequisites()).rejects.toThrow("Python 3.9+");
  const log = vi.fn();
  const service = new EagleSidecar(
    { libraryPath: "/test.library", timeoutMs: 1000, retryMs: 1000 },
    "/unused",
    log,
  );
  service.initialize(checkEaglePrerequisites);
  await service.drain();
  expect(log).toHaveBeenCalledWith({ event: "eagle", code: "missing_dependency" });
  service.start();
  await service.stop();
});
