// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLink, getLinksPage, updateLink } from "@/lib/db/scoped/links";

let db: DatabaseSync;
const flags = {
  insertReturningEmpty: false,
  batchEmptyList: false,
};
const queryLog: string[] = [];

vi.mock("@/lib/db/d1-client", () => ({
  isD1Configured: () => true,
  executeD1Query: async (sql: string, params: SQLInputValue[] = []) => {
    queryLog.push(sql);
    if (flags.insertReturningEmpty && /^INSERT/i.test(sql.trim()) && /RETURNING/i.test(sql)) {
      return [];
    }
    return db.prepare(sql).all(...params);
  },
  executeD1Batch: async (statements: { sql: string; params?: SQLInputValue[] }[]) => {
    if (flags.batchEmptyList) return [];
    return statements.map((s) => db.prepare(s.sql).all(...(s.params ?? [])));
  },
}));

const SCHEMA_SQL = `
  CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    folder_id TEXT,
    original_url TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    is_custom INTEGER DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    clicks INTEGER DEFAULT 0,
    title TEXT,
    meta_title TEXT,
    meta_description TEXT,
    meta_favicon TEXT,
    screenshot_url TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
  );
`;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  queryLog.length = 0;
  flags.insertReturningEmpty = false;
  flags.batchEmptyList = false;
});
afterEach(() => db.close());

describe("createLink branches", () => {
  it("binds isHidden false when the flag is omitted", async () => {
    const link = await createLink("u1", { originalUrl: "https://a.com", slug: "a" });
    expect(link.isHidden).toBe(false);
    expect(link.isCustom).toBe(false);
  });

  it("fails loudly when INSERT RETURNING yields no row", async () => {
    flags.insertReturningEmpty = true;
    await expect(createLink("u1", { originalUrl: "https://a.com", slug: "a" })).rejects.toThrow(
      "INSERT RETURNING * returned no rows",
    );
  });
});

describe("updateLink title trimming", () => {
  it("keeps null when the title is explicitly null", async () => {
    const link = await createLink("u1", {
      originalUrl: "https://a.com",
      slug: "a",
      title: "Old",
    });
    const updated = await updateLink("u1", link.id, { title: null });
    expect(updated?.title).toBeNull();
  });

  it("stores null when the trimmed title is empty", async () => {
    const link = await createLink("u1", {
      originalUrl: "https://a.com",
      slug: "a",
      title: "Old",
    });
    const updated = await updateLink("u1", link.id, { title: "   " });
    expect(updated?.title).toBeNull();
  });

  it("updates only the provided field and clears isCustom back to false", async () => {
    const link = await createLink("u1", {
      originalUrl: "https://a.com",
      slug: "a",
      title: "Keep",
      isCustom: true,
    });
    const updated = await updateLink("u1", link.id, { note: "note only", isCustom: false });
    expect(updated?.title).toBe("Keep");
    expect(updated?.note).toBe("note only");
    expect(updated?.isCustom).toBe(false);
  });
});

describe("getLinksPage defensive batch handling", () => {
  it("returns empty items and zero total when the batch result is missing", async () => {
    await createLink("u1", { originalUrl: "https://a.com", slug: "a" });
    await createLink("u1", { originalUrl: "https://b.com", slug: "b" });
    expect((await getLinksPage("u1", { limit: 10, offset: 0 })).items).toHaveLength(2);

    flags.batchEmptyList = true;
    const page = await getLinksPage("u1", { limit: 10, offset: 0 });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});
