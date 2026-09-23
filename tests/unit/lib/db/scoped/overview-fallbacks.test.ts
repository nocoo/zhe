// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOverviewStats } from "@/lib/db/scoped/overview";

const mockExecuteD1Query = vi.fn();
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
}));

beforeEach(() => {
  mockExecuteD1Query.mockReset();
  mockExecuteD1Query.mockImplementation(async (sql: string) => {
    if (sql.includes("total_links")) return []; // no aggregate row at all
    if (sql.includes("ORDER BY clicks DESC"))
      return [{ slug: "top", original_url: "https://top", clicks: null }];
    if (sql.includes("total_uploads")) return [{ total_uploads: null, total_storage: null }];
    if (sql.includes("as uploads")) return [];
    if (sql.includes("file_type")) return [];
    if (sql.includes("origin_clicks"))
      return [{ date: "2026-09-22", clicks: 2, origin_clicks: null, worker_clicks: null }];
    if (sql.includes("a.device")) return [];
    if (sql.includes("a.browser")) return [];
    if (sql.includes("a.os")) return [];
    throw new Error(`unexpected overview query: ${sql}`);
  });
});

describe("getOverviewStats null-safe fallbacks", () => {
  it("degrades missing aggregate rows and null columns to zeros", async () => {
    const stats = await getOverviewStats("u1");

    expect(stats.totalLinks).toBe(0);
    expect(stats.totalClicks).toBe(0);
    expect(stats.totalUploads).toBe(0);
    expect(stats.totalStorageBytes).toBe(0);
    expect(stats.topLinks).toEqual([{ slug: "top", originalUrl: "https://top", clicks: 0 }]);
    expect(stats.clickTrend).toEqual([{ date: "2026-09-22", clicks: 2, origin: 0, worker: 0 }]);
    expect(stats.uploadTrend).toEqual([]);
    expect(stats.deviceBreakdown).toEqual({});
    expect(stats.browserBreakdown).toEqual({});
    expect(stats.osBreakdown).toEqual({});
    expect(stats.fileTypeBreakdown).toEqual({});
  });
});
