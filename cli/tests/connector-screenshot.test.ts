import { readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OpenCliPage, runOpenCliTask, withOpenCliPage } from "../src/connector/opencli.js";
import { captureScreenshot, captureScreenshotInChild } from "../src/connector/screenshot.js";
import {
  MAX_SCREENSHOT_BYTES,
  screenshotTarget,
  validateScreenshot,
} from "../src/connector/screenshot-core.js";

vi.mock("../src/connector/opencli.js", () => ({
  runOpenCliTask: vi.fn(),
  withOpenCliPage: vi.fn(),
}));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));
const screenshot = readFileSync(new URL("./fixtures/screenshot.webp", import.meta.url));
const url = "https://example.com/article";
let dir: string;
let page: OpenCliPage;
const ready = {
  url,
  type: "text/html",
  title: "An article",
  status: 200,
  ready: true,
  content: true,
};

beforeEach(async () => {
  vi.resetAllMocks();
  dir = await mkdtemp(join(tmpdir(), "zhe-preview-test-"));
  page = {
    newTab: vi.fn().mockResolvedValue("owned-tab"),
    setActivePage: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn(),
    closeWindow: vi.fn(),
    evaluate: vi.fn(async (code) => (code === "location.href" ? url : ready)),
    cdp: vi.fn(async (method) =>
      method === "Page.captureScreenshot" ? { data: screenshot.toString("base64") } : {},
    ),
  };
  vi.mocked(withOpenCliPage).mockImplementation((run) => run(page, "fixture"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("4:3 Retina webpage capture", () => {
  it.each([
    "https://x.com",
    "https://twitter.com/person",
    "https://mobile.x.com/i/article/123",
    "https://docs.github.com/en",
    "https://github.com./owner/repo",
    "file:///private.txt",
    "https://user:password@example.com",
    "https://127.0.0.1",
    "http://192.168.1.1",
    "http://localhost",
    "http://site.local",
    "http://example.com:7006",
  ])("skips %s before opening a browser", (target) => {
    expect(screenshotTarget(target)).toBeNull();
    expect(() => captureScreenshot(target, dir)).toThrow("unsafe_screenshot_url");
    expect(runOpenCliTask).not.toHaveBeenCalled();
  });

  it("keeps ordinary domains distinct from special sites", () => {
    expect(screenshotTarget("https://github.io/project")).toBe("https://github.io/project");
    expect(screenshotTarget("https://github.com.example.com/a")).toBe(
      "https://github.com.example.com/a",
    );
    expect(screenshotTarget("https://example.com/x.com")).toBe("https://example.com/x.com");
    expect(screenshotTarget("https://example.com")).toBe("https://example.com/");
  });

  it("uses an owned tab, 2× desktop metrics and native WebP compression", async () => {
    const file = await captureScreenshotInChild(url, dir);
    expect(page.newTab).toHaveBeenCalledWith(url);
    expect(page.setActivePage).toHaveBeenCalledWith("owned-tab");
    expect(page.cdp).toHaveBeenCalledWith("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 960,
      deviceScaleFactor: 2,
      mobile: false,
    });
    expect(page.cdp).toHaveBeenCalledWith("Page.captureScreenshot", {
      format: "webp",
      quality: 80,
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1280, height: 960, scale: 0.625 },
    });
    expect(file).toMatchObject({
      width: 1600,
      height: 1200,
      mime: "image/webp",
      size: screenshot.length,
    });
    expect(await readFile(file.path)).toEqual(screenshot);
    expect((await stat(file.path)).mode & 0o777).toBe(0o600);
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reduces quality only when needed and never increases the byte budget", async () => {
    let captures = 0;
    vi.mocked(page.cdp).mockImplementation(async (method) =>
      method === "Page.captureScreenshot"
        ? {
            data:
              ++captures === 1
                ? "A".repeat(MAX_SCREENSHOT_BYTES * 2)
                : screenshot.toString("base64"),
          }
        : {},
    );
    expect((await captureScreenshotInChild(url, dir)).size).toBe(screenshot.length);
    const qualities = vi
      .mocked(page.cdp)
      .mock.calls.filter(([method]) => method === "Page.captureScreenshot")
      .map(([, args]) => args?.quality);
    expect(qualities).toEqual([80, 70]);
    await rm(join(dir, "preview.webp"));
    vi.mocked(page.cdp).mockResolvedValue({ data: "A".repeat(MAX_SCREENSHOT_BYTES * 2) });
    await expect(captureScreenshotInChild(url, dir)).rejects.toThrow("screenshot_too_large");
    expect(await readdir(dir)).toEqual([]);
  });

  it.each([
    { ...ready, url: "https://x.com/login" },
    { ...ready, status: 404 },
    { ...ready, title: "Just a moment..." },
    { ...ready, ready: false },
    { ...ready, type: "application/pdf" },
  ])("does not save redirects, challenges, errors or unfinished pages (%j)", async (state) => {
    vi.mocked(page.evaluate).mockResolvedValue(state);
    await expect(captureScreenshotInChild(url, dir)).rejects.toThrow(/screenshot/);
    expect(
      vi.mocked(page.cdp).mock.calls.some(([method]) => method === "Page.captureScreenshot"),
    ).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it("rechecks delayed redirects and sanitizes browser failures", async () => {
    vi.mocked(page.evaluate).mockImplementation(async (code) =>
      code === "location.href" ? "https://github.com/octocat/hello" : ready,
    );
    await expect(captureScreenshotInChild(url, dir)).rejects.toThrow("unsafe_screenshot_url");
    vi.mocked(page.newTab).mockRejectedValue(new Error("private upstream details"));
    await expect(captureScreenshotInChild(url, dir)).rejects.toThrow("screenshot_unavailable");
    vi.mocked(page.newTab).mockResolvedValue(undefined);
    await expect(captureScreenshotInChild(url, dir)).rejects.toThrow("opencli_unavailable");
  });

  it("waits for a replacement navigation context and fails if it never becomes readable", async () => {
    vi.mocked(page.evaluate).mockRejectedValueOnce(new Error("Execution context was destroyed"));
    expect((await captureScreenshotInChild(url, dir)).size).toBe(screenshot.length);
    await rm(join(dir, "preview.webp"));
    vi.mocked(page.evaluate).mockRejectedValue(new Error("Execution context was destroyed"));
    await expect(captureScreenshotInChild(url, dir)).rejects.toThrow("screenshot_unavailable");
    expect(await readdir(dir)).toEqual([]);
  });

  it("sends screenshot work through the same abortable child boundary", async () => {
    const signal = new AbortController().signal;
    await captureScreenshot(url, dir, signal);
    expect(runOpenCliTask).toHaveBeenCalledWith(["--screenshot", url, dir], signal);
  });

  it("rejects forged dimensions, animation, incomplete chunks and oversized files", () => {
    expect(() => validateScreenshot(screenshot)).not.toThrow();
    const dimensions = Buffer.from(screenshot);
    dimensions[24] = 0;
    const animated = Buffer.from(screenshot);
    animated[20] |= 2;
    const size = Buffer.from(screenshot);
    size.writeUInt32LE(0xffffffff, 16);
    for (const invalid of [
      dimensions,
      animated,
      size,
      screenshot.subarray(0, 100),
      Buffer.alloc(MAX_SCREENSHOT_BYTES + 1),
    ])
      expect(() => validateScreenshot(invalid)).toThrow();
  });
});
