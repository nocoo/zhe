import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runEagleAttempt } from "../src/connector/eagle.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
let child: EventEmitter & {
  stdout: PassThrough;
  stdin: PassThrough;
  pid?: number;
  unref: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.useFakeTimers();
  child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stdin: new PassThrough(),
    pid: 12345,
    unref: vi.fn(),
  });
  vi.mocked(spawn).mockReturnValue(child as any);
  vi.spyOn(process, "kill").mockImplementation(() => true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(["saved", "exists", "private path and token"])(
  "allowlists subprocess output: %s",
  async (output) => {
    const result = runEagleAttempt("/local/outbox.json", 1000, new AbortController().signal);
    child.stdout.write(output);
    child.emit("close", 0);
    expect(await result).toBe(output === "saved" || output === "exists" ? output : "retry");
    expect(child.unref).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(spawn).toHaveBeenLastCalledWith("python3", expect.any(Array), {
      detached: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
  },
);
it("kills the entire process group on timeout and releases blocked stdio", async () => {
  const result = runEagleAttempt("/local/outbox.json", 1000, new AbortController().signal);
  child.stdout.write("x".repeat(500));
  child.stdout.write("ignored");
  await vi.advanceTimersByTimeAsync(1250);
  expect(await result).toBe("timeout");
  expect(process.kill).toHaveBeenCalledWith(-12345, "SIGKILL");
  expect(child.stdout.destroyed).toBe(true);
  child.emit("close", 1);
});
it("contains missing executables and cancellation races", async () => {
  const failed = runEagleAttempt("/local/outbox.json", 1000, new AbortController().signal);
  child.stdin.emit("error", new Error("pipe closed"));
  child.emit("error", new Error("spawn private details"));
  expect(await failed).toBe("missing_dependency");
  const controller = new AbortController();
  vi.mocked(process.kill).mockImplementation(() => {
    throw new Error("already gone");
  });
  const cancelled = runEagleAttempt("/local/outbox.json", 1000, controller.signal);
  controller.abort();
  expect(await cancelled).toBe("retry");
  child.pid = undefined;
  const noPid = runEagleAttempt("/local/outbox.json", 1000, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1250);
  expect(await noPid).toBe("timeout");
});

it("collects stdout delivered after process exit before classifying the result", async () => {
  const result = runEagleAttempt("/local/outbox.json", 1000, new AbortController().signal);
  child.emit("exit", 0);
  child.stdout.write("exists");
  child.emit("close", 0);
  expect(await result).toBe("exists");
});

it("drains a durable success message when exit races the deadline", async () => {
  const result = runEagleAttempt("/local/outbox.json", 1000, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1000);
  child.stdout.write("saved\n");
  child.emit("close", null);
  expect(await result).toBe("saved");
  expect(vi.getTimerCount()).toBe(0);
});
