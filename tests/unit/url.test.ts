import { describe, it, expect } from "vitest";
import { resolvePublicOrigin } from "@/lib/url";

describe("resolvePublicOrigin", () => {
  it("returns origin from x-forwarded headers when both present", () => {
    const req = new Request("http://0.0.0.0:7005/api/webhook/abc", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "zhe.to",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
  });

  it("falls back to host header when x-forwarded-host is missing", () => {
    const req = new Request("http://0.0.0.0:7005/api/webhook/abc", {
      headers: {
        "x-forwarded-proto": "https",
        host: "zhe.to",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
  });

  it("falls back to request.url origin when no forwarding headers", () => {
    const req = new Request("http://localhost:7005/api/webhook/abc");
    expect(resolvePublicOrigin(req)).toBe("http://localhost:7005");
  });

  it("falls back to request.url origin when only proto is set (no host headers)", () => {
    const req = new Request("http://0.0.0.0:7005/api/webhook/abc", {
      headers: {
        "x-forwarded-proto": "https",
      },
    });
    // No x-forwarded-host and no explicit host header set;
    // proto is present but host resolves to empty, so fallback to request.url
    const result = resolvePublicOrigin(req);
    expect(result).toBe("http://0.0.0.0:7005");
  });

  it("handles Railway-style forwarded headers", () => {
    const req = new Request("http://0.0.0.0:7005/api/webhook/abc", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "zhe.to",
        host: "0.0.0.0:7005",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
  });

  it("prefers x-forwarded-host over host header", () => {
    const req = new Request("http://0.0.0.0:7005/api/webhook/abc", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "zhe.to",
        host: "internal.railway.app",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
  });

  it("prefers x-real-host over x-forwarded-host", () => {
    const req = new Request("http://0.0.0.0:7005/api/webhook/abc", {
      headers: {
        "x-forwarded-proto": "https",
        "x-real-host": "zhe.to",
        "x-forwarded-host": "origin.zhe.to",
        host: "0.0.0.0:7005",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
  });

  it("uses x-real-host even when x-forwarded-host is absent", () => {
    const req = new Request("http://0.0.0.0:7005/api/webhook/abc", {
      headers: {
        "x-forwarded-proto": "https",
        "x-real-host": "zhe.to",
      },
    });
    expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
  });
});
