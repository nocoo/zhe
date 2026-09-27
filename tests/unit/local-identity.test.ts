import { afterEach, expect, it, vi } from "vitest";
import { executeD1Query } from "@/lib/db/d1-client";
import { authorizeLocalIdentity, localIdentityEnabled } from "@/lib/local-identity";

vi.mock("@/lib/db/d1-client", () => ({ executeD1Query: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("requires launcher capability, local storage, valid credentials and an existing account", async () => {
  vi.stubEnv("ZHE_LOCAL_AUTH_TOKEN", "");
  expect(localIdentityEnabled()).toBe(false);
  expect(await authorizeLocalIdentity("anything")).toBeNull();
  vi.stubEnv("ZHE_LOCAL_AUTH_TOKEN", "fixture-token");
  vi.stubEnv("ZHE_ENVIRONMENT", undefined);
  expect(localIdentityEnabled()).toBe(false);
  vi.stubEnv("ZHE_ENVIRONMENT", "prod");
  expect(localIdentityEnabled()).toBe(false);
  vi.stubEnv("ZHE_ENVIRONMENT", "e2e");
  for (const target of [undefined, "invalid", "https://localhost", "http://localhost.evil"]) {
    vi.stubEnv("D1_PROXY_URL", target);
    expect(localIdentityEnabled()).toBe(false);
  }
  vi.stubEnv("D1_PROXY_URL", "http://127.0.0.1:8788");
  expect(localIdentityEnabled()).toBe(true);
  expect(await authorizeLocalIdentity(null)).toBeNull();
  expect(await authorizeLocalIdentity("short")).toBeNull();
  expect(await authorizeLocalIdentity("invalid-token")).toBeNull();
  vi.mocked(executeD1Query).mockResolvedValueOnce([]);
  expect(await authorizeLocalIdentity("fixture-token")).toBeNull();
  const user = { id: "e2e-test-user-id", email: "e2e@test.local", name: "Fixture", image: null };
  vi.mocked(executeD1Query).mockResolvedValueOnce([user]);
  expect(await authorizeLocalIdentity("fixture-token")).toEqual(user);
});
