import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLinksQuery } from "@/lib/db/scoped/links";

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE links (
    id INTEGER PRIMARY KEY, user_id TEXT, slug TEXT, original_url TEXT, note TEXT,
    meta_title TEXT, meta_description TEXT, created_at INTEGER
  )`);
});

afterEach(() => database.close());

function save(id: number, note: string, owner = "owner") {
  database
    .prepare(
      "INSERT INTO links (id,user_id,slug,original_url,note,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(id, owner, `saved-${id}`, "https://example.com", note, id);
}

function search(query: string) {
  const { conditions, params, joinClause, orderClause } = buildLinksQuery("owner", { query });
  return database
    .prepare(
      `SELECT l.id FROM links l ${joinClause} WHERE ${conditions.join(" AND ")} ${orderClause}`,
    )
    .all(...(params as SQLInputValue[]))
    .map((row) => row.id);
}

describe("link keyword search against SQLite", () => {
  it.each([
    `https://example.com/posts/${"long-path-".repeat(18)}?query=preserved`,
    "收藏文章中的完整中文段落".repeat(8),
    // Native SQLite allows longer LIKE patterns than D1's 50-byte limit.
    // Exceed both limits so this also catches the production failure locally.
    "pasted excerpt ".repeat(4000),
  ])("finds long URLs and pasted excerpts without pattern limits (%#)", (query) => {
    save(1, query);
    save(2, `${query} for someone else`, "other");
    save(3, "unrelated text");
    expect(search(query)).toEqual([1]);
  });

  it("matches punctuation literally while preserving ASCII case-insensitive search", () => {
    save(1, "Keep MIX%_Text exactly");
    save(2, "Keep mix-extra-text instead");
    expect(search("mix%_text")).toEqual([1]);
  });
});
