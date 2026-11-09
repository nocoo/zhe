import { describe, expect, it, vi } from "vitest";
import { ConnectorError } from "../src/connector/core.js";
import { assertPublicMediaDns, isPublicAddress } from "../src/connector/dns.js";

describe("isPublicAddress", () => {
  const privateIpv4 = [
    "0.1.2.3",
    "10.0.0.1",
    "127.0.0.1",
    "224.0.0.1",
    "169.254.10.1",
    "172.16.0.1",
    "172.31.1.1",
    "192.0.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "100.127.1.1",
    "198.18.1.1",
    "198.19.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "300.0.0.1",
    "1.2.3",
  ];
  const publicIpv4 = ["1.0.0.1", "8.8.8.8", "104.244.42.1", "93.184.216.34"];

  it.each(privateIpv4.map((address) => [address, false] as const))(
    "rejects private %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(false);
    },
  );

  it.each(publicIpv4.map((address) => [address, true] as const))("accepts public %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ["8.8.8.8", true],
    ["104.244.42.1", true],
    ["2606:4700:4700::1111", true],
    ["2001:4860:4860::8888", false],
    ["127.0.0.1", false],
    ["not-an-ip", false],
    ["256.0.0.1", false],
    ["23ab::1", true],
    ["2001:db8::1", false],
    [":::bogus", false],
  ])("classifies %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("assertPublicMediaDns", () => {
  it("rejects unrelated hosts before touching the network", async () => {
    await expect(assertPublicMediaDns("evil.example")).rejects.toBeInstanceOf(ConnectorError);
  });

  it.each(["A", "AAAA"])("requires non-empty answers for %s queries", async (type) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { Status: 0, Answer: type === "AAAA" ? [] : [] },
          { headers: { "content-type": "application/dns-json" } },
        ),
      );
    await expect(assertPublicMediaDns("pbs.twimg.com", undefined, fetcher)).rejects.toMatchObject({
      code: "media_dns_unavailable",
    });
  });

  it.each([
    "http-not-ok",
    "wrong-content-type",
    "invalid-json",
    "dns-status",
    "private-answer",
    "wrong-type",
    "oversized",
  ] as const)("fails closed on %s", async (scenario) => {
    const fetcher = vi.fn().mockImplementation(async () => {
      if (scenario === "http-not-ok") {
        return new Response("oops", {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      if (scenario === "wrong-content-type") {
        return new Response("{}", { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (scenario === "invalid-json") {
        return new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/dns-json" },
        });
      }
      if (scenario === "dns-status") {
        return Response.json(
          { Status: 2 },
          { headers: { "content-type": "application/dns-json" } },
        );
      }
      if (scenario === "private-answer") {
        return Response.json(
          { Status: 0, Answer: [{ type: 1, data: "127.0.0.1" }] },
          { headers: { "content-type": "application/dns-json" } },
        );
      }
      if (scenario === "wrong-type") {
        return Response.json(
          { Status: 0, Answer: [{ type: 99, data: "8.8.8.8" }] },
          { headers: { "content-type": "application/dns-json" } },
        );
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(20_000));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "application/dns-json" } },
      );
    });
    await expect(
      assertPublicMediaDns("video.twimg.com", undefined, fetcher),
    ).rejects.toBeInstanceOf(ConnectorError);
  });

  it("accepts public A and AAAA records", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { Status: 0, Answer: [{ type: 1, data: "104.244.42.1" }] },
          { headers: { "content-type": "application/dns-json" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { Status: 0, Answer: [{ type: 28, data: "2606:4700:4700::1111" }] },
          { headers: { "content-type": "application/dns-json" } },
        ),
      );
    await expect(
      assertPublicMediaDns("pbs.twimg.com", undefined, fetcher),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
