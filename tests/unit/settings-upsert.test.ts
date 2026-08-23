// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteD1Query = vi.fn();
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
}));

import {
  upsertAiSettings,
  upsertBackyPullWebhook,
  upsertBackySettings,
  upsertPreviewStyle,
  upsertXraySettings,
} from "@/lib/db/scoped/settings";

describe("settings upsert empty RETURNING", () => {
  beforeEach(() => {
    mockExecuteD1Query.mockReset();
    mockExecuteD1Query.mockResolvedValue([]);
  });

  it("throws when preview upsert returns no row", async () => {
    await expect(upsertPreviewStyle("u1", "card")).rejects.toThrow("no rows");
  });

  it("throws when Backy upsert returns no row", async () => {
    await expect(
      upsertBackySettings("u1", { webhookUrl: "https://example.com", apiKey: "k" }),
    ).rejects.toThrow("no rows");
  });

  it("throws when Xray upsert returns no row", async () => {
    await expect(
      upsertXraySettings("u1", { apiUrl: "https://example.com", apiToken: "t" }),
    ).rejects.toThrow("no rows");
  });

  it("throws when pull webhook upsert returns no row", async () => {
    await expect(upsertBackyPullWebhook("u1", { key: "pull" })).rejects.toThrow("no rows");
  });

  it("throws when AI upsert returns no row", async () => {
    await expect(
      upsertAiSettings("u1", {
        provider: "anthropic",
        apiKey: "k",
        model: "m",
        baseURL: null,
        sdkType: null,
        authType: null,
      }),
    ).rejects.toThrow("no rows");
  });
});
