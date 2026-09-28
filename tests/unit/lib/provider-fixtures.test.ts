import { afterEach, expect, it, vi } from "vitest";
import { installProviderFixtures } from "@/scripts/lib/provider-fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("leaves hosted production untouched and isolates local external providers", async () => {
  const real = vi.fn<typeof fetch>().mockResolvedValue(new Response("local"));
  vi.stubGlobal("fetch", real);
  vi.stubEnv("ZHE_LOCAL_AUTH_TOKEN", "fixture-token");
  vi.stubEnv("ZHE_ENVIRONMENT", "prod");
  installProviderFixtures();
  expect(fetch).toBe(real);
  vi.stubEnv("ZHE_ENVIRONMENT", "e2e");
  installProviderFixtures();
  expect(await (await fetch("http://127.0.0.1:8788/api/health")).text()).toBe("local");
  expect(real).toHaveBeenCalledTimes(1);
  expect((await fetch("https://unknown.example/charge", { method: "POST" })).status).toBe(503);
  expect(
    (
      await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        body: JSON.stringify({ model: "fixture-error" }),
      })
    ).status,
  ).toBe(503);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify({ model: "fixture:folder:tag:new-tag" }),
  });
  const result = await response.json();
  expect(JSON.parse(result.output[0].content[0].text).folders[0].folderId).toBe("folder");
  expect(real).toHaveBeenCalledTimes(1);
});

it("uses a synthetic Xray boundary for real tweet and bookmark requests", async () => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("ZHE_LOCAL_AUTH_TOKEN", "fixture");
  vi.stubEnv("ZHE_ENVIRONMENT", "e2e");
  installProviderFixtures();
  const tweet = await fetch("https://xray.example.invalid/api/twitter/tweets/123").then(
    (response) => response.json(),
  );
  expect(tweet.data.id).toBe("123");
  expect(tweet.data.author.name).toBe("Alex River");
  const bookmarks = await fetch("https://xray.example.invalid/api/twitter/me/bookmarks").then(
    (response) => response.json(),
  );
  expect(bookmarks.data).toHaveLength(1);
  expect(
    (
      await fetch("https://xray.example.invalid/api/twitter/tweets/123", {
        headers: { "X-Webhook-Key": "fixture-error" },
      })
    ).status,
  ).toBe(503);
});
