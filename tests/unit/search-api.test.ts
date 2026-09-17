import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/search/route";
import { clearAllRateLimits } from "@/lib/api/rate-limit";

const { auth, search } = vi.hoisted(() => ({ auth: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ getAuthContext: auth }));
const request = (body: unknown) =>
  new Request("http://localhost/api/search", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  clearAllRateLimits();
  auth.mockResolvedValue({ userId: "owner", db: { search } });
  search.mockResolvedValue({ total: 0, items: [] });
});
it("requires session, ignores client ownership and never caches private results", async () => {
  auth.mockResolvedValueOnce(null);
  expect((await POST(request({ query: "needle" }))).status).toBe(401);
  const response = await POST(request({ query: "needle", userId: "other" }));
  expect(response.status).toBe(200);
  expect(search).toHaveBeenCalledWith("needle", "all", 20, 0);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each([
  null,
  [],
  { query: 1 },
  { query: "x", source: "unknown" },
  { query: "x", limit: 51 },
  { query: "x", limit: 0 },
  { query: "x", offset: -1 },
  { query: "x", offset: 0.1 },
  { query: "x".repeat(2001) },
])("rejects malformed parameters %j", async (body) =>
  expect((await POST(request(body))).status).toBe(400),
);
it("bounds streamed bodies, missing body and bad JSON", async () => {
  expect((await POST(request({ query: "x".repeat(17000) }))).status).toBe(413);
  expect((await POST(new Request("http://localhost/api/search", { method: "POST" }))).status).toBe(
    400,
  );
  expect(
    (await POST(new Request("http://localhost/api/search", { method: "POST", body: "{" }))).status,
  ).toBe(400);
});
it("returns a safe retryable error and rate limits by session user", async () => {
  search.mockRejectedValueOnce(new Error("private D1 detail"));
  const response = await POST(request({ query: "x" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private D1 detail");
  for (let i = 0; i < 119; i++) await POST(request({ query: "x" }));
  expect((await POST(request({ query: "x" }))).status).toBe(429);
});
