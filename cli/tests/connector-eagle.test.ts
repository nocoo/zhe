import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetConfig,
  _setConfig,
  createConfigManager,
  getEagleConfig,
  saveEagleConfig,
} from "../src/config.js";
import { normalizeXPost, type XCapture } from "../src/connector/core.js";
import {
  checkEagleLibrary,
  configuredEagle,
  EagleSidecar,
  type EagleTask,
  eagleConfig,
  eagleKey,
  runEagleAttempt,
} from "../src/connector/eagle.js";

function capture(count: number): XCapture {
  const data = normalizeXPost(
    {
      rest_id: "123",
      legacy: { full_text: "Private test text", created_at: "2026-09-12" },
      core: { user_results: { result: { legacy: { screen_name: "test" } } } },
    },
    "123",
  );
  if (!data) throw new Error("fixture");
  data.media = Array.from({ length: count }, (_, i) => ({
    id: String(200 + i),
    type: "PHOTO",
    url: `https://pbs.twimg.com/media/test${i}.jpg`,
  }));
  return data;
}

let dir: string;
let services: EagleSidecar[];
const log = vi.fn();
const config = { libraryPath: "/configured/Drive.library", timeoutMs: 1000, retryMs: 1000 };
const saved = vi.fn(async (path: string) => {
  const task = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, JSON.stringify({ ...task, done: true }));
  return "saved" as const;
});
function service(attempt = saved, path = dir) {
  const sidecar = new EagleSidecar(config, path, log, attempt);
  services.push(sidecar);
  return sidecar;
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "zhe-eagle-unit-"));
  services = [];
  vi.clearAllMocks();
});
afterEach(async () => {
  await Promise.all(services.map((sidecar) => sidecar.stop()));
  _resetConfig();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("Eagle configuration", () => {
  it("checks real library structure without writing to the library", async () => {
    const library = join(await realpath(dir), "Valid.library");
    await expect(checkEagleLibrary(library)).rejects.toThrow("unavailable or invalid");
    await mkdir(join(library, "images"), { recursive: true });
    await expect(checkEagleLibrary(library)).rejects.toThrow();
    await writeFile(join(library, "metadata.json"), "{}");
    await expect(checkEagleLibrary(library)).resolves.toBeUndefined();
    await symlink(library, join(dir, "Alias.library"));
    await expect(checkEagleLibrary(join(await realpath(dir), "Alias.library"))).rejects.toThrow();
    expect(await readdir(library)).toEqual(["images", "metadata.json"]);
  });
  it("is opt-in and preserves the CLI login", () => {
    const manager = createConfigManager(dir, false);
    _setConfig(manager);
    manager.write({ apiKey: "fixture-login" });
    expect(getEagleConfig()).toBeUndefined();
    expect(configuredEagle(log)).toBeUndefined();
    saveEagleConfig({ enabled: false, libraryPath: "" });
    expect(getEagleConfig()?.enabled).toBe(false);
    expect(manager.get("apiKey")).toBe("fixture-login");
    expect(eagleConfig(getEagleConfig())).toBeUndefined();
    expect(eagleConfig({ enabled: true, libraryPath: "/some/Drive.library" })).toEqual({
      libraryPath: "/some/Drive.library",
      timeoutMs: 120_000,
      retryMs: 5000,
    });
    expect(eagleConfig({ enabled: true, ...config })).toEqual(config);
  });
  it.each([
    { libraryPath: "relative.library" },
    { libraryPath: "/wrong" },
    { libraryPath: "/bad\0.library" },
    { timeoutMs: 0 },
    { timeoutMs: 600001 },
    { timeoutMs: 1.5 },
    { retryMs: 0 },
    { retryMs: 300001 },
    { retryMs: 1.5 },
    { enabled: "yes" },
    { libraryPath: 23 },
  ])("isolates malformed configuration: %j", (invalid) => {
    const manager = createConfigManager(dir, false);
    _setConfig(manager);
    manager.write({ eagle: { enabled: true, ...config, ...invalid } as any });
    expect(configuredEagle(log)).toBeUndefined();
    expect(log).toHaveBeenCalledWith({ event: "eagle", code: "invalid_config" });
  });
  it("starts configured recovery, with isolated dev storage", async () => {
    _setConfig(createConfigManager(dir, false));
    saveEagleConfig({ enabled: true, ...config });
    const start = vi.spyOn(EagleSidecar.prototype, "start").mockImplementation(() => {});
    const sidecar = configuredEagle(log, async () => {});
    expect(sidecar).toBeInstanceOf(EagleSidecar);
    await sidecar?.drain();
    expect(start).toHaveBeenCalledOnce();
    await sidecar?.stop();
    vi.stubEnv("ZHE_DEV", "1");
    await configuredEagle(log, async () => {})?.stop();
    vi.unstubAllEnvs();
  });
});

describe("durable Eagle outbox", () => {
  it.each([
    { done: "true" },
    { done: 1 },
    { nextAttemptAt: "9999999999999" },
    { attempts: -1 },
    { libraryPath: "/different.library", text: null },
    { media: { id: "200", type: "VIDEO", url: "https://pbs.twimg.com/media/test.jpg" } },
  ])("quarantines malformed state before scheduling or library selection: %j", async (invalid) => {
    const first = service();
    first.submit(capture(1));
    await first.drain();
    await first.stop();
    const path = join(dir, `${eagleKey(config.libraryPath, "123", "200")}.json`);
    const task = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...task, ...invalid }));
    const next = service();
    next.recover();
    await next.drain();
    expect((await readdir(dir)).some((name) => name.endsWith(".quarantined"))).toBe(true);
    expect(log.mock.calls.some(([event]) => event.code === "paused_library")).toBe(false);
  });
  it("compacts a valid completed legacy record and explicitly pauses another library", async () => {
    const first = service();
    first.submit(capture(1));
    await first.drain();
    await first.stop();
    const key = eagleKey(config.libraryPath, "123", "200");
    const other = new EagleSidecar({ ...config, libraryPath: "/other.library" }, dir, log, saved);
    services.push(other);
    other.recover();
    await other.drain();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ code: "paused_library" }));
    const resumed = service();
    resumed.recover();
    await resumed.drain();
    expect((await readdir(dir)).includes(`${key}.json`)).toBe(false);
    expect(await readFile(join(dir, ".done", key), "utf8")).toBe("");
    expect(saved).toHaveBeenCalledOnce();
  });
  it("finishes durable enqueue before graceful shutdown", async () => {
    const sidecar = service();
    sidecar.submit(capture(4));
    await sidecar.stop();
    expect((await readdir(dir)).filter((name) => name.endsWith(".json"))).toHaveLength(4);
    expect(saved).not.toHaveBeenCalled();
  });
  it("preserves both records if quarantine already exists", async () => {
    const sidecar = service();
    const path = join(dir, `${"a".repeat(64)}.json`);
    await writeFile(path, "damaged current");
    await writeFile(`${path}.quarantined`, "old evidence");
    sidecar.recover();
    await sidecar.drain();
    expect(await readFile(path, "utf8")).toBe("damaged current");
    expect(await readFile(`${path}.quarantined`, "utf8")).toBe("old evidence");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ code: "quarantine_conflict" }));
  });
  it("honors persisted retry timing after the current config changes", async () => {
    const first = service();
    first.submit(capture(1));
    await first.drain();
    await first.stop();
    const path = join(dir, `${eagleKey(config.libraryPath, "123", "200")}.json`);
    const task = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...task, done: false, nextAttemptAt: 0 }));
    const attempt = vi.fn(async () => "retry" as const);
    const restarted = new EagleSidecar({ ...config, retryMs: 300_000 }, dir, log, attempt);
    services.push(restarted);
    restarted.recover();
    await restarted.drain();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 1001);
    restarted.recover();
    await restarted.drain();
    expect(attempt).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1, 2, 3, 4, 5])(
    "handles %i images without truncating oversized posts",
    async (count) => {
      const sidecar = service();
      sidecar.submit(capture(count));
      await sidecar.drain();
      expect(saved).toHaveBeenCalledTimes(count > 4 ? 0 : count);
      expect((await readdir(dir)).filter((name) => name.endsWith(".json"))).toHaveLength(
        count > 4 ? 0 : count,
      );
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /Private test text|pbs\.twimg|Drive\.library|fixture-login/,
      );
    },
  );
  it("starts all four attempts before any one completes and does not share enrich cancellation", async () => {
    const releases: (() => Promise<void>)[] = [];
    const attempt = vi.fn(
      (path: string, _timeout?: number, signal?: AbortSignal) =>
        new Promise<"saved">((resolve) => {
          expect(signal?.aborted).toBe(false);
          releases.push(async () => resolve(await saved(path)));
        }),
    );
    const sidecar = service(attempt);
    sidecar.start();
    sidecar.start();
    sidecar.submit(capture(4));
    sidecar.submit(capture(4));
    await vi.waitFor(() => expect(attempt).toHaveBeenCalledTimes(4));
    sidecar.recover();
    await Promise.all(releases.map((release) => release()));
    await sidecar.drain();
    expect(attempt).toHaveBeenCalledTimes(4);
  });
  it("retains receipts across duplicate and concurrent enqueue without resetting backoff", async () => {
    const one = service();
    const two = service();
    one.submit(capture(1));
    two.submit(capture(1));
    await Promise.all([one.drain(), two.drain()]);
    const path = join(dir, `${eagleKey(config.libraryPath, "123", "200")}.json`);
    const before = await readFile(path, "utf8");
    one.submit(capture(1));
    await one.drain();
    expect(await readFile(path, "utf8")).toBe(before);
    expect((await readdir(dir)).filter((name) => name.endsWith(".json"))).toHaveLength(1);
  });
  it("isolates one failed image and recovers it after restart without retrying siblings", async () => {
    const attempt = vi.fn(async (path: string) => {
      const task: EagleTask = JSON.parse(await readFile(path, "utf8"));
      if (task.media.id === "201") {
        await writeFile(
          path,
          JSON.stringify({ ...task, attempts: 1, nextAttemptAt: Date.now() + 30_000 }),
        );
        return "retry";
      }
      return saved(path);
    });
    const first = service(attempt as typeof saved);
    first.submit(capture(4));
    await first.drain();
    await first.stop();
    expect(log.mock.calls.filter(([event]) => event.code === "saved")).toHaveLength(3);
    const restarted = service();
    restarted.recover();
    await restarted.drain();
    expect(saved).toHaveBeenCalledTimes(3);
    const path = join(dir, `${eagleKey(config.libraryPath, "123", "201")}.json`);
    const task = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...task, nextAttemptAt: 0 }));
    restarted.recover();
    await restarted.drain();
    expect(saved).toHaveBeenCalledTimes(4);
  });
  it("contains queue, scan, callback and worker failures", async () => {
    await writeFile(join(dir, "not-a-directory"), "sentinel");
    const broken = service(saved, join(dir, "not-a-directory"));
    broken.submit(capture(1));
    await broken.drain();
    broken.recover();
    await broken.drain();
    const rejected = service(vi.fn().mockRejectedValue(new Error("private upstream")));
    rejected.submit(capture(1));
    await rejected.drain();
    log.mockImplementationOnce(() => {
      throw new Error("logger failed");
    });
    rejected.submit(capture(0));
    await writeFile(join(dir, `${"a".repeat(64)}.json`), "broken");
    rejected.recover();
    await rejected.drain();
    expect(
      log.mock.calls.some(([event]) =>
        ["queue_error", "retry", "quarantined"].includes(event.code),
      ),
    ).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private upstream");
  });
  it("quarantines a collision or corrupted task once, without retrying or leaking details", async () => {
    const sidecar = service();
    sidecar.submit(capture(1));
    await sidecar.drain();
    const path = join(dir, `${eagleKey(config.libraryPath, "123", "200")}.json`);
    const task = JSON.parse(await readFile(path, "utf8"));
    await sidecar.stop();
    await writeFile(
      path,
      JSON.stringify({ ...task, done: false, lastError: "conflict", timeoutMs: 1000 }),
    );
    const restarted = service();
    restarted.recover();
    await restarted.drain();
    expect((await readdir(dir)).some((name) => name.endsWith(".quarantined"))).toBe(true);
    expect(log.mock.calls.filter(([event]) => event.code === "quarantined")).toHaveLength(1);
    restarted.recover();
    await restarted.drain();
    expect(log.mock.calls.filter(([event]) => event.code === "quarantined")).toHaveLength(1);
    const huge = join(dir, `${"c".repeat(64)}.json`);
    await writeFile(huge, "x".repeat(1_048_577));
    restarted.recover();
    await restarted.drain();
    expect((await readdir(dir)).some((name) => name === `${"c".repeat(64)}.json.quarantined`)).toBe(
      true,
    );
  });
  it("ignores unsafe media, wrong-library jobs and stopped submissions", async () => {
    const sidecar = service();
    const invalid = capture(1);
    invalid.tweet.id = "../unsafe";
    sidecar.submit(invalid);
    invalid.tweet.id = "123";
    invalid.tweet.author.username = "../unsafe";
    sidecar.submit(invalid);
    invalid.tweet.author.username = "test";
    invalid.media[0].url = "http://127.0.0.1/private";
    sidecar.submit(invalid);
    await writeFile(
      join(dir, `${"f".repeat(64)}.json`),
      JSON.stringify({ libraryPath: "/different.library" }),
    );
    sidecar.recover();
    await sidecar.drain();
    await sidecar.stop();
    sidecar.submit(capture(1));
    sidecar.recover();
    expect(saved).not.toHaveBeenCalled();
    const absent = service(saved, join(dir, "missing"));
    absent.recover();
    await absent.drain();
  });
  it("does not start an already-aborted attempt", async () => {
    expect(await runEagleAttempt("unused", 1000, AbortSignal.abort())).toBe("retry");
  });
});
