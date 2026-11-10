import { describe, expect, it, vi } from "vitest";
import { parseBrowser, parseDevice, parseOS, recordClickAsync } from "../src/analytics";
import type { Env } from "../src/types";

describe("parseDevice", () => {
  it.each([
    ["", "unknown"],
    ["Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)", "tablet"],
    ["Mozilla/5.0 (Linux; Android 9; SM-T510)", "tablet"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)", "mobile"],
    ["Mozilla/5.0 (Linux; Android 10; Mobile)", "mobile"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "desktop"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "desktop"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "desktop"],
    ["curl/7.68.0", "unknown"],
  ])("classifies %j as %s", (ua, expected) => {
    expect(parseDevice(ua)).toBe(expected);
  });
});

describe("parseBrowser", () => {
  it.each([
    ["", "Unknown"],
    ["Mozilla/5.0 Edg/91.0", "Edge"],
    ["Mozilla/5.0 OPR/77.0", "Opera"],
    ["Mozilla/5.0 Opera/12.0", "Opera"],
    ["Mozilla/5.0 Chrome/91.0 Safari/537.36", "Chrome"],
    ["Mozilla/5.0 Safari/605.1.15", "Safari"],
    ["Mozilla/5.0 Firefox/89.0", "Firefox"],
    ["Mozilla/5.0 MSIE 10.0", "IE"],
    ["Mozilla/5.0 Trident/7.0", "IE"],
    ["Mozilla/5.0 Chromium/91.0", "Chromium"],
    ["Mozilla/5.0 Chrome/91.0 Chromium/91.0", "Chromium"],
    ["custom-bot", "Unknown"],
  ])("detects browser in %j", (ua, expected) => {
    expect(parseBrowser(ua)).toBe(expected);
  });
});

describe("parseOS", () => {
  it.each([
    ["", "Unknown"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)", "iOS"],
    ["Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)", "iOS"],
    ["Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X)", "iOS"],
    ["Mozilla/5.0 (Linux; Android 10)", "Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Windows 10"],
    ["Mozilla/5.0 (Windows NT 6.3; Win64; x64)", "Windows 8.1"],
    ["Mozilla/5.0 (Windows NT 6.2; Win64; x64)", "Windows 8"],
    ["Mozilla/5.0 (Windows NT 6.1; Win64; x64)", "Windows 7"],
    ["Mozilla/5.0 (Windows NT 5.1)", "Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "macOS"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "Linux"],
    ["Mozilla/5.0 (X11; CrOS x86_64 13904.0.0)", "Chrome OS"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1)", "Unknown"],
  ])("detects OS in %j", (ua, expected) => {
    expect(parseOS(ua)).toBe(expected);
  });
});

describe("recordClickAsync", () => {
  it("posts analytics to the origin without blocking the redirect", async () => {
    const waitUntil = vi.fn((promise: Promise<unknown>) => void promise);
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://zhe.to/abc", {
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Chrome/91.0",
        referer: "https://example.com/",
        "CF-IPCountry": "US",
      },
    });
    Object.assign(request, { cf: { city: "Seattle" } });

    recordClickAsync(
      ctx,
      { ORIGIN_URL: "https://origin.zhe.to/", WORKER_SECRET: "secret" } as Env,
      42,
      request,
    );

    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0][0];

    expect(fetchMock).toHaveBeenCalledWith(
      "https://origin.zhe.to/api/record-click",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        }),
      }),
    );

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      linkId: 42,
      device: "mobile",
      browser: "Chrome",
      os: "iOS",
      country: "US",
      city: "Seattle",
      referer: "https://example.com/",
      source: "worker",
    });

    vi.unstubAllGlobals();
  });

  it("logs and swallows origin failures", async () => {
    const waitUntil = vi.fn((promise: Promise<unknown>) => void promise);
    const ctx = { waitUntil } as unknown as ExecutionContext;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    recordClickAsync(
      ctx,
      { ORIGIN_URL: "https://origin.zhe.to", WORKER_SECRET: "secret" } as Env,
      1,
      new Request("https://zhe.to/x"),
    );

    await waitUntil.mock.calls[0][0];
    expect(errorSpy).toHaveBeenCalledWith("Failed to record click:", expect.any(Error));

    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });
});
