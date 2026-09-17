import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as d1 from "@/lib/db/d1-client";
import { ScopedDB } from "@/lib/db/scoped";
import {
  ensureSearchIndex,
  loadSearchDocuments,
  SearchIndexPendingError,
  searchResources,
} from "@/lib/db/scoped/search";

let database: DatabaseSync;
const query = <T>(sql: string, params: unknown[] = []) =>
  database.prepare(sql).all(...(params as SQLInputValue[])) as T[];
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (["0014_drop_discord_bot_settings.sql", "0016_drop_backy_pull_secret.sql"].includes(file))
      continue;
    database.exec(readFileSync(`drizzle/migrations/${file}`, "utf8"));
  }
  database.exec("INSERT INTO users(id) VALUES ('owner'),('other')");
  vi.spyOn(d1, "executeD1Query").mockImplementation(async (sql, params) => query(sql, params));
  vi.spyOn(d1, "executeD1Batch").mockImplementation(async (statements) =>
    statements.map((s) => query(s.sql, s.params)),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  database.close();
});
function link(id: number, title = "Title", owner = "owner") {
  database
    .prepare(
      "INSERT INTO links(id,user_id,slug,original_url,meta_title,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(id, owner, `slug-${id}`, `https://github.com/owner/repo${id}`, title, id);
}
function capture(id: number, result: unknown, owner = "owner") {
  database
    .prepare(
      "INSERT INTO github_bookmarks(link_id,user_id,source_url,result_json,updated_at) VALUES (?,?,?,?,1)",
    )
    .run(id, owner, `https://github.com/owner/repo${id}`, JSON.stringify(result));
}
describe("migrated search index with real SQL", () => {
  it("searches enriched bodies, literal punctuation and owner tags with stable rank/pagination and no tenant leaks", async () => {
    link(1, "needle");
    link(2, "needle prefix");
    link(3, "Other");
    link(4, "needle", "other");
    capture(3, { readme: `${"padding ".repeat(10000)}NEEDLE café   中文 %_ C++` });
    const db = new ScopedDB("owner");
    const first = await db.search("needle", "github", 2);
    expect(first.total).toBe(3);
    expect(first.items.map((x) => x.id)).toEqual([1, 2]);
    expect((await db.search("needle", "all", 2, 2)).items.map((x) => x.id)).toEqual([3]);
    expect((await db.search("CAFÉ\n中文 %_ c++")).items[0]?.match.label).toBe("README");
    expect((await db.getLinks({ query: "café 中文" })).map((x) => x.id)).toEqual([3]);
    expect((await db.getLinksPage({ query: "needle", limit: 2, offset: 0 })).total).toBe(3);
    expect((await new ScopedDB("other").search("needle")).total).toBe(1);
    expect((await db.search("\n ")).total).toBe(0);
    expect((await db.search("needle", "web")).total).toBe(0);
  });
  it("invalidates source edits, tags, folders, analysis-only updates, URL changes and deletion", async () => {
    link(1);
    capture(1, { readme: "old-body", analysis: { summary: "old-analysis" } });
    await ensureSearchIndex("owner");
    database.exec(
      "INSERT INTO folders(id,user_id,name,icon,created_at) VALUES ('f','owner','FolderNeedle','folder',1); UPDATE links SET folder_id='f' WHERE id=1; INSERT INTO tags(id,user_id,name,color,created_at) VALUES ('t','owner','TagNeedle','red',1); INSERT INTO link_tags VALUES (1,'t')",
    );
    expect((await searchResources("owner", "tagneedle")).total).toBe(1);
    database.exec(
      "UPDATE tags SET name='Renamed' WHERE id='t'; UPDATE folders SET name='NewFolder' WHERE id='f'",
    );
    expect((await searchResources("owner", "tagneedle")).total).toBe(0);
    expect((await searchResources("owner", "newfolder")).total).toBe(1);
    database
      .prepare("UPDATE github_bookmarks SET result_json=? WHERE link_id=1")
      .run(JSON.stringify({ readme: "new-body", analysis: { summary: "new-analysis" } }));
    expect((await searchResources("owner", "old-analysis")).total).toBe(0);
    expect((await searchResources("owner", "new-analysis")).total).toBe(1);
    database.exec("UPDATE links SET original_url='https://example.com/new' WHERE id=1");
    expect((await searchResources("owner", "new-body")).total).toBe(0);
    database.exec("DELETE FROM links WHERE id=1");
    expect(query("SELECT * FROM search_documents")).toHaveLength(0);
  });
  it("indexes published X entities and quotes only, excluding draft and mismatched owner snapshots", async () => {
    link(1);
    link(2);
    link(3);
    database.exec("UPDATE links SET original_url='https://x.com/a/status/1' WHERE id=1");
    const tweet = {
      text: "published",
      author: { username: "realhandle" },
      entities: { hashtags: ["topic"] },
      quoted_tweet: { text: "quote-body" },
    };
    database
      .prepare(
        "INSERT INTO x_bookmarks(link_id,user_id,source_url,result_json,draft_json,updated_at) VALUES (1,'owner','https://x.com/a/status/1',?,?,1)",
      )
      .run(JSON.stringify({ tweet }), JSON.stringify({ tweet: { text: "secret-draft" } }));
    capture(2, { readme: "foreign-secret" }, "other");
    capture(3, { readme: "old-url-secret" });
    database.exec(
      "UPDATE github_bookmarks SET source_url='https://example.com/old' WHERE link_id=3",
    );
    for (const needle of ["@realhandle", "#topic", "quote-body"])
      expect((await searchResources("owner", needle)).total).toBe(1);
    for (const needle of ["secret-draft", "foreign-secret", "old-url-secret"])
      expect((await searchResources("owner", needle)).total).toBe(0);
    database.exec("DELETE FROM x_bookmarks WHERE link_id=1");
    expect((await searchResources("owner", "quote-body")).total).toBe(0);
  });
  it("tracks full ideas/todos and tag lifecycle, preserving direct-match and ownership", async () => {
    database.exec(
      "INSERT INTO ideas(id,user_id,title,content,excerpt,created_at,updated_at) VALUES (1,'owner','Idea','DeepBody','brief',1,1); INSERT INTO todos(id,user_id,title,content,position,created_at,updated_at) VALUES (1,'owner','Parent','',0,1,1),(2,'owner','Child','DeepBody',1,1,1); INSERT INTO todo_tags VALUES (2,'shopping',1)",
    );
    expect((await searchResources("owner", "deepbody")).items.map((x) => x.kind).sort()).toEqual([
      "idea",
      "todo",
    ]);
    expect((await searchResources("owner", "shopping")).items.map((x) => x.id)).toEqual([2]);
    database.exec(
      "UPDATE todo_tags SET name='updatedtag' WHERE todo_id=2; UPDATE ideas SET content='NewIdeaBody' WHERE id=1",
    );
    expect((await searchResources("owner", "shopping")).total).toBe(0);
    expect((await searchResources("owner", "updatedtag")).total).toBe(1);
    database.exec("DELETE FROM todos; DELETE FROM ideas");
    expect((await searchResources("owner", "deepbody")).total).toBe(0);
    expect(await loadSearchDocuments("owner", "link", [])).toEqual([]);
  });
  it("coalesces simultaneous rebuilds and CAS retries changes during hydration", async () => {
    link(1, "oldtitle");
    let raced = false;
    vi.mocked(d1.executeD1Batch).mockImplementation(async (statements) => {
      if (!raced && statements[0]?.sql.startsWith("UPDATE search_documents")) {
        raced = true;
        database.exec("UPDATE links SET meta_title='newtitle' WHERE id=1");
      }
      return statements.map((s) => query(s.sql, s.params));
    });
    const [a, b] = await Promise.all([
      searchResources("owner", "newtitle"),
      searchResources("owner", "newtitle"),
    ]);
    expect(a.total).toBe(1);
    expect(b.total).toBe(1);
    expect((await searchResources("owner", "oldtitle")).total).toBe(0);
    expect(
      query<{ revision: number; indexed_revision: number }>(
        "SELECT revision,indexed_revision FROM search_documents",
      )[0],
    ).toMatchObject({ revision: 1, indexed_revision: 1 });
  });
  it("uses the owner index and reuses clean projections without parsing every snapshot", async () => {
    for (let i = 1; i <= 40; i++) {
      link(i);
      capture(i, { readme: `unique-${i}` });
    }
    await ensureSearchIndex("owner");
    vi.mocked(d1.executeD1Query).mockClear();
    await searchResources("owner", "unique-40");
    expect(
      vi.mocked(d1.executeD1Query).mock.calls.filter(([sql]) => sql.includes("g.result_json")),
    ).toHaveLength(1);
    expect(
      JSON.stringify(
        query(
          "EXPLAIN QUERY PLAN SELECT * FROM search_documents WHERE user_id=? AND instr(search_text,?)>0",
          ["owner", "needle"],
        ),
      ),
    ).toContain("INDEX idx_search_user");
  });
  it("rechecks counts and fills the page when a selected row changes during hydration", async () => {
    link(1, "needle");
    link(2, "needle");
    await ensureSearchIndex("owner");
    let changed = false;
    vi.mocked(d1.executeD1Batch).mockImplementation(async (statements) => {
      const result = statements.map((statement) => query(statement.sql, statement.params));
      if (!changed && statements[0]?.sql.includes("COUNT(*)")) {
        changed = true;
        database.exec("UPDATE links SET meta_title='unrelated' WHERE id=1");
      }
      return result;
    });
    const result = await searchResources("owner", "needle");
    expect(result.total).toBe(1);
    expect(result.items.map((hit) => hit.id)).toEqual([2]);
  });
  it("limits each rebuild and makes progress across retries", async () => {
    for (let id = 1; id <= 129; id++) link(id);
    await expect(ensureSearchIndex("owner")).rejects.toBeInstanceOf(SearchIndexPendingError);
    expect(query("SELECT * FROM search_documents WHERE indexed_revision<>revision")).toHaveLength(
      1,
    );
    await new ScopedDB("owner").prepareSearchIndex();
    expect(query("SELECT * FROM search_documents WHERE indexed_revision<>revision")).toHaveLength(
      0,
    );
  });
  it("keeps the largest permitted Unicode README searchable without returning it to the client", async () => {
    link(1);
    capture(1, { readme: `${"İ".repeat(499_990)} tail-needle` });
    const result = await searchResources("owner", "tail-needle");
    expect(result.total).toBe(1);
    expect(JSON.stringify(result).length).toBeLessThan(2000);
    expect(
      query<{ size: number }>(
        "SELECT length(cast(search_text AS blob)) AS size FROM search_documents",
      )[0]?.size,
    ).toBeLessThan(2_000_000);
  });
});
