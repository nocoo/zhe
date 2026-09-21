// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLink, getWebhookStats, recordClick, slugExists, upsertTweetCache } from "@/lib/db";

const mockExecuteD1Query = vi.fn();
vi.mock("@/lib/db/d1-client", () => ({
  isD1Configured: () => true,
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
}));

beforeEach(() => {
  mockExecuteD1Query.mockReset();
  mockExecuteD1Query.mockImplementation(async () => []);
});

describe("db index defensive RETURNING guards", () => {
  it("reports a slug as free when the count row is missing", async () => {
    expect(await slugExists("ghost-slug")).toBe(false);
  });

  it("fails loudly when link INSERT RETURNING yields no row", async () => {
    await expect(
      createLink({ userId: "u1", originalUrl: "https://a.com", slug: "a" }),
    ).rejects.toThrow("INSERT RETURNING * returned no rows");
  });

  it("fails loudly when analytics INSERT RETURNING yields no row", async () => {
    await expect(recordClick({ linkId: 1, device: "desktop" })).rejects.toThrow(
      "INSERT RETURNING * returned no rows",
    );
  });

  it("fails loudly when tweet-cache UPSERT RETURNING yields no row", async () => {
    await expect(
      upsertTweetCache({
        tweetId: "t1",
        authorUsername: "owner",
        authorName: "Owner",
        authorAvatar: "https://a/avatar.png",
        tweetText: "hello",
        tweetUrl: "https://x.com/owner/status/t1",
        lang: "en",
        tweetCreatedAt: "2026-09-01T00:00:00Z",
        rawData: "{}",
      }),
    ).rejects.toThrow("UPSERT RETURNING * returned no rows");
  });
});

describe("getWebhookStats null-safe aggregates", () => {
  it("degrades missing count rows to zero totals", async () => {
    const stats = await getWebhookStats("u1");
    expect(stats.totalLinks).toBe(0);
    expect(stats.totalClicks).toBe(0);
    expect(stats.recentLinks).toEqual([]);
  });
});
