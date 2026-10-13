import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainR2Deletions } from "@/lib/r2/gc";

const mockExecuteD1Query = vi.fn();
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
}));

const mockDeleteR2Object = vi.fn();
vi.mock("@/lib/r2/client", () => ({
  deleteR2Object: (...args: unknown[]) => mockDeleteR2Object(...args),
}));

beforeEach(() => {
  mockExecuteD1Query.mockReset();
  mockDeleteR2Object.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("drainR2Deletions", () => {
  it("runs the global cron path without user filter and skips keys re-referenced since selection", async () => {
    mockExecuteD1Query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DELETE FROM x_media")) {
        // Global path: no "AND user_id=?" clause, only the two time params.
        expect(sql).not.toContain("user_id=?");
        return [];
      }
      if (sql.includes("FROM r2_deletions d")) {
        expect(sql).not.toContain("user_id=?");
        return [{ key: "orphan.png", created_at: 123 }];
      }
      if (sql.startsWith("SELECT 1 FROM uploads")) {
        // The key was re-referenced between selection and the point-of-delete recheck.
        return [{ "1": 1 }];
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await drainR2Deletions()).toBe(0);
    expect(mockDeleteR2Object).not.toHaveBeenCalled();
    // No deletion ack should be written for the re-referenced key.
    const acks = mockExecuteD1Query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.startsWith("DELETE FROM r2_deletions WHERE"),
    );
    expect(acks).toHaveLength(0);
  });

  it("acknowledges drained keys after a successful R2 delete", async () => {
    mockExecuteD1Query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DELETE FROM x_media")) return [];
      if (sql.includes("FROM r2_deletions d")) return [{ key: "gone.png", created_at: 9 }];
      if (sql.startsWith("SELECT 1 FROM uploads")) return [];
      if (sql.startsWith("DELETE FROM r2_deletions WHERE")) return [];
      throw new Error(`unexpected query: ${sql}`);
    });
    mockDeleteR2Object.mockResolvedValueOnce(undefined);

    expect(await drainR2Deletions()).toBe(1);
    expect(mockDeleteR2Object).toHaveBeenCalledWith("gone.png");
    const acks = mockExecuteD1Query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.startsWith("DELETE FROM r2_deletions WHERE"),
    );
    expect(acks).toHaveLength(1);
    expect(acks[0]?.[1]).toEqual(["gone.png", 9]);
  });

  it.each([
    { domain: undefined, publicDomain: "" },
    { domain: "", publicDomain: "" },
    { domain: "https://cdn.example.com", publicDomain: "https://cdn.example.com" },
    { domain: "https://cdn.example.com/", publicDomain: "https://cdn.example.com" },
  ] as const)(
    "filters referenced screenshots with public domain %#",
    async ({ domain, publicDomain }) => {
      vi.stubEnv("R2_PUBLIC_DOMAIN", domain);
      const fixedNow = 1_700_000_000_000;
      vi.spyOn(Date, "now").mockReturnValue(fixedNow);
      const key = "shots/a.webp";
      mockExecuteD1Query.mockImplementation(async (sql: string) => {
        if (sql.startsWith("DELETE FROM x_media")) return [];
        if (sql.includes("FROM r2_deletions d")) return [{ key, created_at: 42 }];
        if (sql.startsWith("SELECT 1 FROM uploads")) return [];
        if (sql.startsWith("DELETE FROM r2_deletions WHERE")) return [];
        throw new Error(`unexpected query: ${sql}`);
      });
      mockDeleteR2Object.mockResolvedValueOnce(undefined);

      expect(await drainR2Deletions(undefined, fixedNow)).toBe(1);

      const selection = mockExecuteD1Query.mock.calls.find(
        ([sql]) => typeof sql === "string" && sql.includes("FROM r2_deletions d"),
      );
      expect(selection?.[1]).toEqual([fixedNow, publicDomain]);
      const recheck = mockExecuteD1Query.mock.calls.find(
        ([sql]) => typeof sql === "string" && sql.startsWith("SELECT 1 FROM uploads"),
      );
      expect(recheck?.[1]).toEqual([
        key,
        key,
        key,
        Math.max(fixedNow, Date.now()),
        `${publicDomain}/${key}`,
      ]);
    },
  );
});
