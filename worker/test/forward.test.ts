import { describe, expect, it, vi } from "vitest";
import { forwardToOrigin } from "../src/forward";
import type { Env } from "../src/types";

describe("forwardToOrigin", () => {
  it("forwards GET with geo headers and preserves the host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://zhe.to/dashboard?tab=1", {
      method: "GET",
      headers: {
        Host: "zhe.to",
        "CF-Connecting-IP": "203.0.113.5",
        "CF-IPCountry": "JP",
      },
    });
    Object.assign(request, { cf: { city: "Tokyo" } });

    await forwardToOrigin(request, { ORIGIN_URL: "https://origin.zhe.to/" } as Env);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://origin.zhe.to/dashboard?tab=1",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
      }),
    );
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get("X-Forwarded-For")).toBe("203.0.113.5");
    expect(headers.get("X-Forwarded-Host")).toBe("zhe.to");
    expect(headers.get("X-Real-Host")).toBe("zhe.to");
    expect(headers.get("x-vercel-ip-country")).toBe("JP");
    expect(headers.get("x-vercel-ip-city")).toBe("Tokyo");

    vi.unstubAllGlobals();
  });

  it("includes the body for mutating methods", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://zhe.to/api/hook", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    await forwardToOrigin(request, { ORIGIN_URL: "https://origin.zhe.to" } as Env);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(request.body);

    vi.unstubAllGlobals();
  });

  it("omits the body for HEAD requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://zhe.to/assets/app.js", { method: "HEAD" });
    await forwardToOrigin(request, { ORIGIN_URL: "https://origin.zhe.to" } as Env);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("HEAD");
    expect(init).not.toHaveProperty("body");

    vi.unstubAllGlobals();
  });
});
