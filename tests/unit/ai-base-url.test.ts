// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("node:dns", () => ({
  promises: {
    lookup: (...args: unknown[]) => lookup(...args),
  },
}));

import { assertSafeAiBaseUrl, isBlockedAiAddress } from "@/models/ai-base-url";

describe("isBlockedAiAddress", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "192.168.1.1",
    "172.16.0.1",
    "100.64.0.1",
    "0.0.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])("blocks %s", (ip) => {
    expect(isBlockedAiAddress(ip)).toBe(true);
  });

  it("allows a public unicast address", () => {
    expect(isBlockedAiAddress("1.1.1.1")).toBe(false);
    expect(isBlockedAiAddress("8.8.8.8")).toBe(false);
  });
});

describe("assertSafeAiBaseUrl", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("accepts https public hosts after DNS", async () => {
    lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
    await expect(assertSafeAiBaseUrl("https://api.example.com/v1")).resolves.toBeUndefined();
  });

  it("rejects http, credentials, and localhost", async () => {
    await expect(assertSafeAiBaseUrl("http://api.example.com")).rejects.toThrow("https");
    await expect(assertSafeAiBaseUrl("https://user:pass@api.example.com")).rejects.toThrow(
      "credentials",
    );
    await expect(assertSafeAiBaseUrl("https://localhost/v1")).rejects.toThrow("publicly routable");
    await expect(assertSafeAiBaseUrl("https://foo.local/v1")).rejects.toThrow("publicly routable");
  });

  it("rejects literal private and mapped loopback IPs", async () => {
    await expect(assertSafeAiBaseUrl("https://10.0.0.1/v1")).rejects.toThrow("publicly routable");
    await expect(assertSafeAiBaseUrl("https://169.254.1.1/v1")).rejects.toThrow(
      "publicly routable",
    );
    await expect(assertSafeAiBaseUrl("https://[::ffff:127.0.0.1]/v1")).rejects.toThrow(
      "publicly routable",
    );
  });

  it("rejects when DNS returns a blocked address", async () => {
    lookup.mockResolvedValue([{ address: "100.64.0.1", family: 4 }]);
    await expect(assertSafeAiBaseUrl("https://rebind.example.com")).rejects.toThrow(
      "publicly routable",
    );
  });
});
