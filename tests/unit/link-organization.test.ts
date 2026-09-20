// @vitest-environment node
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sql: DatabaseSync;
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: async (query: string, params: SQLInputValue[] = []) =>
    sql.prepare(query).all(...params),
  executeD1Batch: async (statements: { sql: string; params?: SQLInputValue[] }[]) => {
    sql.exec("BEGIN");
    try {
      const result = statements.map((s) => sql.prepare(s.sql).all(...(s.params ?? [])));
      sql.exec("COMMIT");
      return result;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  },
}));

import { loadLinkOrgContext } from "@/lib/ai/link-context";
import { ScopedDB } from "@/lib/db/scoped";
import { saveLinkOrganization } from "@/lib/db/scoped/link-organization";
import { linkPresentation } from "@/models/link-presentation";
import { buildSearchDocument } from "@/models/search";

const db = new ScopedDB("owner");
const fullReadme = `# Start\n${"Complete text.\n".repeat(5000)}FINAL SECTION: offline support`;
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("drizzle/migrations")
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        !["0014_drop_discord_bot_settings.sql", "0016_drop_backy_pull_secret.sql"].includes(f),
    )
    .sort())
    sql.exec(readFileSync(`drizzle/migrations/${f}`, "utf8"));
  sql.exec(`INSERT INTO users(id,email) VALUES('owner','owner@test.local'),('other','other@test.local');
    INSERT INTO links(id,user_id,original_url,slug,meta_title,meta_description,note,created_at) VALUES(1,'owner','https://github.com/a/b','test-link','a/b','Original description','Manual note',1);
    INSERT INTO folders(id,user_id,name,created_at) VALUES('f','owner','开发',1),('foreign','other','私有',1);
    INSERT INTO tags(id,user_id,name,color,created_at) VALUES('t','owner','Docs','primary',1),('old','owner','Old','primary',1);
    INSERT INTO link_tags(link_id,tag_id) VALUES(1,'old');`);
});
afterEach(() => sql.close());
const revision = () =>
  Number(
    sql.prepare("SELECT revision FROM search_documents WHERE kind='link' AND resource_id=1").get()
      ?.revision,
  );
const input = () => ({
  linkId: 1,
  revision: revision(),
  title: "书签管理",
  note: "用户修改过的备注",
  folderId: "f",
  tagIds: ["t", "t"],
});
describe("shared source context and atomic organization", () => {
  it("merges historical AI tags idempotently without altering notes or raw topics", () => {
    const archive = {
      topics: ["raw-only"],
      analysis: { summary: "Historical summary", tags: [" docs ", "DOCS", "New", "", 42] },
    };
    sql
      .prepare(
        "INSERT INTO github_bookmarks(link_id,user_id,source_url,result_json,updated_at) VALUES(1,'owner','https://github.com/a/b',?,1)",
      )
      .run(JSON.stringify(archive));
    sql.exec(`INSERT INTO links(id,user_id,original_url,slug,created_at) VALUES(2,'owner','https://github.com/new/repo','old-source',1),(3,'owner','https://github.com/a/c','foreign-source',1);
      INSERT INTO github_bookmarks(link_id,user_id,source_url,result_json,updated_at) VALUES
      (2,'owner','https://github.com/old/repo','{"analysis":{"tags":["stale"]}}',1),
      (3,'other','https://github.com/a/c','{"analysis":{"tags":["foreign"]}}',1);`);
    const migration = readFileSync(
      "drizzle/migrations/0030_share_github_analysis_tags.sql",
      "utf8",
    );
    sql.exec(migration);
    sql.exec(migration);
    expect(
      sql
        .prepare("SELECT name FROM tags ORDER BY name")
        .all()
        .map((r) => r.name),
    ).toEqual(["Docs", "Old"]);
    expect(
      sql
        .prepare(
          "SELECT t.name FROM tags t JOIN link_tags lt ON lt.tag_id=t.id WHERE lt.link_id=1 ORDER BY t.name",
        )
        .all()
        .map((r) => r.name),
    ).toEqual(["Docs", "Old"]);
    expect(sql.prepare("SELECT note FROM links WHERE id=1").get()?.note).toBe("Manual note");
    expect(
      JSON.parse(
        String(
          sql.prepare("SELECT result_json FROM github_bookmarks WHERE link_id=1").get()
            ?.result_json,
        ),
      ),
    ).toEqual(archive);
  });
  it("uses all available metadata and accepts missing README", async () => {
    const c = await loadLinkOrgContext(db, "owner", 1);
    expect(c?.notices.join()).toContain("README 未收录");
    assert(c);
    expect(JSON.parse(c.prompt)).toMatchObject({
      link: { metaTitle: "a/b", metaDescription: "Original description" },
      current: { note: "Manual note", tags: "Old" },
    });
  });
  it("supplies complete README and repository data, retaining historical analysis as context", async () => {
    sql
      .prepare(
        "INSERT INTO github_bookmarks(link_id,user_id,source_url,result_json,updated_at) VALUES(1,'owner','https://github.com/a/b',?,1)",
      )
      .run(
        JSON.stringify({
          fullName: "a/b",
          readme: fullReadme,
          stars: 12,
          analysis: { summary: "old" },
        }),
      );
    const c = await loadLinkOrgContext(db, "owner", 1);
    expect(JSON.parse(c?.prompt ?? "{}").sources.github).toMatchObject({
      readme: fullReadme,
      stars: 12,
    });
    expect(c?.supplied).toContain("README 全文");
    expect(c?.notices).toEqual([]);
  });
  it("does not expose other tenants or a source snapshot for an old URL", async () => {
    expect(await loadLinkOrgContext(new ScopedDB("other"), "other", 1)).toBeNull();
    sql.exec(
      `INSERT INTO github_bookmarks(link_id,user_id,source_url,result_json,updated_at) VALUES(1,'owner','https://github.com/old/repo','{"readme":"secret old source"}',1)`,
    );
    expect((await loadLinkOrgContext(db, "owner", 1))?.prompt).not.toContain("secret old source");
  });
  it("supplies stored X text, quotes, and media without requiring README", async () => {
    sql.exec("UPDATE links SET original_url='https://x.com/a/status/123' WHERE id=1");
    const capture = {
      tweet: {
        text: "正文",
        quoted_tweet: { text: "引用" },
        media: [{ type: "VIDEO", url: "https://cdn.test/video.mp4" }],
      },
    };
    sql
      .prepare(
        "INSERT INTO x_bookmarks(link_id,user_id,source_url,result_json,updated_at) VALUES(1,'owner','https://x.com/a/status/123',?,1)",
      )
      .run(JSON.stringify(capture));
    const c = await loadLinkOrgContext(db, "owner", 1);
    expect(JSON.parse(c?.prompt ?? "{}").sources.x).toEqual(capture);
    expect(c?.notices).toEqual([]);
  });
  it("saves the edited fields and desired tags together, reusing existing tag IDs", async () => {
    const before = revision();
    const saved = await saveLinkOrganization("owner", input());
    expect(saved.link).toMatchObject({
      title: "书签管理",
      note: "用户修改过的备注",
      folderId: "f",
      metaTitle: "a/b",
      metaDescription: "Original description",
    });
    expect(saved.tags.map((t) => t.name).sort()).toEqual(["Docs"].sort());
    expect(revision()).toBeGreaterThan(before);
    expect((await db.getLinkById(1))?.title).toBe("书签管理");
  });
  it("rejects stale results after manual edits without creating tags", async () => {
    const draft = input();
    sql.exec("UPDATE links SET note='new manual note' WHERE id=1");
    await expect(saveLinkOrganization("owner", draft)).rejects.toThrow();
    expect((await db.getLinkById(1))?.note).toBe("new manual note");
    expect(sql.prepare("SELECT COUNT(*) AS n FROM tags").get()?.n).toBe(2);
  });
  it("rejects foreign users and folders", async () => {
    await expect(saveLinkOrganization("other", input())).rejects.toThrow();
    await expect(
      saveLinkOrganization("owner", { ...input(), folderId: "foreign" }),
    ).rejects.toThrow();
    expect((await db.getLinkById(1))?.note).toBe("Manual note");
  });
  it("rejects missing, deleted and foreign tags without creating anything", async () => {
    sql.exec(
      "INSERT INTO tags(id,user_id,name,color,created_at) VALUES('foreign-tag','other','私有','primary',1)",
    );
    for (const id of ["不存在", "foreign-tag"]) {
      await expect(saveLinkOrganization("owner", { ...input(), tagIds: [id] })).rejects.toThrow();
      expect((await db.getLinkById(1))?.note).toBe("Manual note");
    }
    sql.exec("DELETE FROM tags WHERE id='t'");
    await expect(saveLinkOrganization("owner", input())).rejects.toThrow();
    expect(sql.prepare("SELECT COUNT(*) AS n FROM tags").get()?.n).toBe(2);
  });
  it("rolls back all edits when tag persistence fails", async () => {
    sql.exec(
      "CREATE TRIGGER fail_tag BEFORE INSERT ON link_tags BEGIN SELECT RAISE(ABORT,'test failure'); END",
    );
    await expect(saveLinkOrganization("owner", input())).rejects.toThrow();
    expect((await db.getLinkById(1))?.title).toBeNull();
    expect((await db.getTagsForLink(1)).map((t) => t.name)).toEqual(["Old"]);
  });
  it("allows long user notes and clearing fields but rejects overlong titles and invalid tags", async () => {
    await expect(
      saveLinkOrganization("owner", { ...input(), title: "字".repeat(33) }),
    ).rejects.toThrow();
    await expect(saveLinkOrganization("owner", { ...input(), tagIds: [""] })).rejects.toThrow();
    const saved = await saveLinkOrganization("owner", {
      ...input(),
      title: "",
      note: "字".repeat(400),
      tagIds: [],
      folderId: null,
    });
    expect(saved.link.title).toBeNull();
    expect(saved.link.note).toHaveLength(400);
    expect(saved.tags).toEqual([]);
  });
  it("uses shared title/note priority and indexes original metadata too", async () => {
    const { link } = await saveLinkOrganization("owner", input());
    expect(linkPresentation(link)).toMatchObject({
      title: link.title,
      description: link.note,
      originalTitle: "a/b",
      originalDescription: "Original description",
    });
    const doc = buildSearchDocument({
      kind: "link",
      id: 1,
      createdAt: 1,
      title: link.title,
      originalTitle: link.metaTitle,
      note: link.note,
      url: link.originalUrl,
    });
    expect(doc.title).toBe(link.title);
    expect(doc.fields).toContainEqual({ label: "原始标题", value: "a/b", group: "title" });
  });
});

it("persists visibility per owner without changing the saved link", async () => {
  expect((await db.getLinkById(1))?.isHidden).toBe(false);
  expect(await new ScopedDB("other").updateLink(1, { isHidden: true })).toBeNull();
  expect((await db.updateLink(1, { isHidden: true }))?.isHidden).toBe(true);
  expect((await db.getLinkById(1))?.isHidden).toBe(true);
  expect((await db.updateLink(1, { isHidden: false }))?.isHidden).toBe(false);
  expect((await db.getLinkById(1))?.originalUrl).toBe("https://github.com/a/b");
});
