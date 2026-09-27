import { afterEach, expect, it, vi } from "vitest";
import { prepareTestEnvironment } from "@/scripts/lib/test-environment";

afterEach(() => vi.unstubAllEnvs());

it("removes inherited production credentials and keeps one local identity across config reloads", () => {
  const before = { ...process.env };
  try {
    delete process.env.ZHE_AUTOMATION_ENV_READY;
    process.env.AUTH_SECRET = "real-secret";
    process.env.CLOUDFLARE_API_TOKEN = "real-token";
    prepareTestEnvironment();
    expect(process.env.CLOUDFLARE_API_TOKEN).toBe("");
    expect(process.env.AUTH_SECRET).not.toBe("real-secret");
    expect(process.env.AUTH_SECRET).toHaveLength(64);
    expect(process.env.ZHE_LAUNCH_INTENT).toBe("automation");
    const secret = process.env.AUTH_SECRET;
    prepareTestEnvironment();
    expect(process.env.AUTH_SECRET).toBe(secret);
  } finally {
    process.env = before;
  }
});
