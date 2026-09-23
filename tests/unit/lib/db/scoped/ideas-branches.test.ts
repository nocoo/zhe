// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdea, getIdeas, getIdeasPage, updateIdea } from "@/lib/db/scoped/ideas";

let db: DatabaseSync;
const flags = {
  insertReturningEmpty: false,
  batchEmptyList: false,
  batchStatementsEmptyRows: false,
};
const queryLog: string[] = [];

vi.mock("@/lib/db/d1-client", () => ({
  isD1Configured: () => true,
  executeD1Query: async (sql: string, params: SQLInputValue[] = []) => {
    queryLog.push(sql);
    if (flags.insertReturningEmpty && /^INSERT INTO ideas /i.test(sql.trim())) return [];
    return db.prepare(sql).all(...params);
  },
  executeD1Batch: async (statements: { sql: string; params?: SQLInputValue[] }[]) => {
    if (flags.batchEmptyList) return [];
    if (flags.batchStatementsEmptyRows) return statements.map(() => []);
    return statements.map((s) => db.prepare(s.sql).all(...(s.params ?? [])));
  },
}));

const SCHEMA_SQL = `
  CREATE TABLE ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    excerpt TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE idea_tags (
    idea_id INTEGER NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (idea_id, tag_id)
  );
  CREATE TABLE search_documents (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    resource_id INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    indexed_revision INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    source TEXT,
    search_text TEXT,
    titles TEXT,
    identities TEXT,
    metadata TEXT,
    summaries TEXT
  );
`;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  queryLog.length = 0;
  flags.insertReturningEmpty = false;
  flags.batchEmptyList = false;
  flags.batchStatementsEmptyRows = false;
});
afterEach(() => db.close());

describe("rowToListItem fallbacks", () => {
  it("maps a stored NULL excerpt to null instead of crashing", async () => {
    db.prepare(
      "INSERT INTO ideas (user_id, title, content, excerpt, created_at, updated_at) VALUES ('u1', 'Legacy', 'Body', NULL, 1, 1)",
    ).run();
    const items = await getIdeas("u1");
    expect(items).toHaveLength(1);
    expect(items[0]?.excerpt).toBeNull();
    expect(items[0]?.title).toBe("Legacy");
  });
});

describe("getIdeasPage query path", () => {
  it("runs the search-index rebuild and excludes ideas without an index document", async () => {
    await createIdea("u1", { title: "Indexed later", content: "hello world" });
    const page = await getIdeasPage("u1", { query: "hello", limit: 5, offset: 0 });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    // The dirty-row sweep proves ensureSearchIndex ran for the page query too.
    expect(queryLog.some((sql) => sql.includes("indexed_revision<>revision"))).toBe(true);
  });

  it("returns empty items and zero total when the batch result is missing", async () => {
    await createIdea("u1", { title: "Any", content: "Body" });
    flags.batchEmptyList = true;
    const page = await getIdeasPage("u1", { limit: 5, offset: 0 });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

describe("createIdea defensive branch", () => {
  it("fails loudly when INSERT RETURNING yields no row", async () => {
    flags.insertReturningEmpty = true;
    await expect(createIdea("u1", { title: "Ghost", content: "Body" })).rejects.toThrow(
      "Failed to create idea",
    );
  });
});

describe("updateIdea defensive branch", () => {
  it("returns null when the update batch loses its row", async () => {
    const idea = await createIdea("u1", { title: "Before", content: "Body" });
    flags.batchStatementsEmptyRows = true;
    expect(await updateIdea("u1", idea.id, { title: "After" })).toBeNull();
  });
});
