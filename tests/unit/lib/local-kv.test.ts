import { afterEach, expect, it, vi } from "vitest";
import {
  kvBulkDeleteLinks,
  kvBulkPutLinks,
  kvDeleteLink,
  kvListKeys,
  kvPutLink,
} from "@/lib/kv/client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses the configured native local KV provider for all existing mutations", async () => {
  vi.stubEnv("CLOUDFLARE_API_BASE_URL", "http://127.0.0.1:8788");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "local");
  vi.stubEnv("CLOUDFLARE_KV_NAMESPACE_ID", "local");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "fixture-secret");
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ success: true, result: [], result_info: {} }));
  vi.stubGlobal("fetch", request);
  const data = { id: 1, originalUrl: "https://example.com", expiresAt: null };
  await kvPutLink("test", data);
  await kvDeleteLink("test");
  await kvListKeys();
  await kvBulkDeleteLinks(["test"]);
  await kvBulkPutLinks([{ slug: "test", data }]);
  expect(request).toHaveBeenCalledTimes(5);
  for (const [url] of request.mock.calls)
    expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:8788\/client\/v4\//);
});
