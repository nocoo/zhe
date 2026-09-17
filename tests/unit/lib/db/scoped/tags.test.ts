import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { executeD1Query } from "@/lib/db/d1-client";
import { getTagsForLinks } from "@/lib/db/scoped/tags";

let db: DatabaseSync;
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: vi.fn(async (sql: string, params: SQLInputValue[] = []) => {
    if (params.length > 100) throw new Error("D1 parameter limit exceeded");
    return db.prepare(sql).all(...params);
  }),
}));

beforeEach(() => {
  vi.mocked(executeD1Query).mockClear();
  db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE links (id INTEGER PRIMARY KEY, user_id TEXT);
    CREATE TABLE tags (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, color TEXT, created_at INTEGER);
    CREATE TABLE link_tags (link_id INTEGER, tag_id TEXT, PRIMARY KEY(link_id, tag_id));
    INSERT INTO tags VALUES ('a','owner','Reading','blue',1), ('b','owner','Saved','red',2),
      ('private','other','Private','green',3);
    INSERT INTO links VALUES (93,'other');
    INSERT INTO link_tags VALUES (93,'private');
  `);
  for (let id = 1; id <= 92; id++) {
    db.prepare("INSERT INTO links VALUES (?,'owner')").run(id);
    if (id <= 91) {
      db.prepare("INSERT INTO link_tags VALUES (?,'a'),(?,'b')").run(id, id);
    }
  }
});

afterEach(() => db.close());

it("loads every tag across D1 batches without including another owner's links", async () => {
  const result = await getTagsForLinks(
    "owner",
    Array.from({ length: 93 }, (_, i) => i + 1),
  );
  expect(result.size).toBe(91);
  for (let id = 1; id <= 91; id++) {
    expect(
      result
        .get(id)
        ?.map((tag) => tag.id)
        .sort(),
    ).toEqual(["a", "b"]);
  }
  expect(result.has(92)).toBe(false);
  expect(result.has(93)).toBe(false);
});

it("returns an empty map without querying D1 for an empty batch", async () => {
  expect(await getTagsForLinks("owner", [])).toEqual(new Map());
  expect(executeD1Query).not.toHaveBeenCalled();
});
