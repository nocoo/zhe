import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createPresignedUploadUrl,
  deleteR2Object,
  deleteR2Objects,
  listR2Objects,
  uploadBufferToR2,
  uploadStreamToR2,
} from "@/lib/r2/local-binding";

const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("D1_PROXY_URL", "http://127.0.0.1:8788");
  vi.stubEnv("D1_PROXY_SECRET", "fixture-secret");
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("signs uploads for one key and content type without leaking the secret", () => {
  const url = new URL(createPresignedUploadUrl("a/b.png", "image/png"));
  expect(url.searchParams.get("signature")).toMatch(/^[a-f0-9]{64}$/);
  expect(url.searchParams.get("key")).toBe("a/b.png");
  expect(url.href).not.toContain("fixture-secret");
  const other = new URL(createPresignedUploadUrl("a/b.png", "text/plain"));
  expect(other.searchParams.get("signature")).not.toBe(url.searchParams.get("signature"));
});
it("rejects missing or remote local bindings", () => {
  vi.stubEnv("D1_PROXY_URL", "");
  expect(() => createPresignedUploadUrl("key", "text/plain")).toThrow("not configured");
  vi.stubEnv("D1_PROXY_URL", "http://localhost:8788");
  vi.stubEnv("D1_PROXY_SECRET", "");
  expect(() => createPresignedUploadUrl("key", "text/plain")).toThrow();
  vi.stubEnv("D1_PROXY_SECRET", "fixture-secret");
  for (const base of ["https://localhost", "http://localhost.evil"]) {
    vi.stubEnv("D1_PROXY_URL", base);
    expect(() => createPresignedUploadUrl("key", "text/plain")).toThrow("loopback");
  }
});
it("uses authenticated native storage for buffers, streams and batched deletes", async () => {
  fetcher.mockImplementation(async () => new Response("{}"));
  await uploadBufferToR2("file.txt", new Uint8Array([1, 2]), "text/plain");
  expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: "Bearer fixture-secret",
    "Content-Type": "text/plain",
  });
  await uploadStreamToR2("stream.bin", Readable.from([Buffer.from("hello")]), "text/plain", 5);
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ duplex: "half" });
  expect(await deleteR2Objects([])).toBe(0);
  expect(await deleteR2Objects(Array.from({ length: 1001 }, (_, i) => `key-${i}`))).toBe(1001);
  await deleteR2Object("single");
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it("follows listing cursors and surfaces resource failures", async () => {
  fetcher
    .mockResolvedValueOnce(Response.json({ objects: [{ key: "a" }], cursor: "next" }))
    .mockResolvedValueOnce(Response.json({ objects: [{ key: "b" }], cursor: null }));
  expect(await listR2Objects()).toEqual([{ key: "a" }, { key: "b" }]);
  expect(fetcher.mock.calls[1]?.[0]).toContain("cursor=next");
  fetcher.mockResolvedValueOnce(new Response("denied", { status: 403 }));
  await expect(listR2Objects("private/")).rejects.toThrow("403");
});
it("uses the stable public media origin and preserves stream validation errors", async () => {
  vi.stubEnv("R2_PUBLIC_DOMAIN", "https://zhe.dev.hexly.ai/_local/media/demo/r2");
  expect(createPresignedUploadUrl("file", "text/plain")).toMatch(
    /^https:\/\/zhe.dev.hexly.ai\/_local\/media\/demo\/upload/,
  );
  const body = Readable.from([Buffer.from("hello")]);
  fetcher.mockRejectedValueOnce(new Error("transport failed"));
  await expect(uploadStreamToR2("file", body, "text/plain", 5)).rejects.toThrow("transport failed");
  const broken = new Readable({ read() {} });
  const invalid = new Error("invalid digest");
  broken.on("error", () => {});
  broken.destroy(invalid);
  fetcher.mockRejectedValueOnce(new Error("transport failed"));
  await expect(uploadStreamToR2("file", broken, "text/plain", 5)).rejects.toThrow("invalid digest");
});
it("routes the existing application storage client through native local bindings", async () => {
  vi.stubEnv("LOCAL_R2", "1");
  const client = await import("@/lib/r2/client");
  fetcher.mockImplementation(async () => Response.json({ objects: [], cursor: null }));
  expect(await client.createPresignedUploadUrl("key", "text/plain")).toContain("/upload?");
  await client.uploadBufferToR2("key", new Uint8Array([1]), "text/plain");
  await client.uploadStreamToR2(
    "key",
    Readable.from([Buffer.from("x")]),
    "text/plain",
    1,
    "a".repeat(64),
  );
  expect(await client.listR2Objects()).toEqual([]);
  await client.deleteR2Object("key");
  expect(await client.deleteR2Objects(["key"])).toBe(1);
});
