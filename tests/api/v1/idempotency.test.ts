/**
 * L2 E2E tests for PATCH idempotency across v1 resources.
 *
 * Background: v1 has no PUT routes — only PATCH. PATCH must be idempotent
 * when the same body is sent twice in a row: subsequent calls should return
 * 200 with identical resource state and produce no observable side effects
 * (no duplicate tag rows, no churn on unrelated fields).
 *
 * Covers links, tags, folders, ideas.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import {
  seedTestUser,
  seedApiKey,
  seedTag,
  seedIdea,
  cleanupTestData,
  queryD1,
} from "../helpers/seed";

const BASE = getBaseUrl();
const TEST_USER_ID = "api-v1-idempotency-test-user";
let apiKey: string;

beforeAll(async () => {
  await cleanupTestData(TEST_USER_ID);
  await seedTestUser(TEST_USER_ID);
  apiKey = await seedApiKey(TEST_USER_ID, {
    name: "Idempotency",
    scopes:
      "links:read,links:write,tags:read,tags:write,folders:read,folders:write,ideas:read,ideas:write",
  });
});

afterAll(async () => {
  await cleanupTestData(TEST_USER_ID);
});

/** Strip volatile fields (e.g. updatedAt) before comparing two responses. */
function normalize<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const { updatedAt: _u, ...rest } = obj;
  void _u;
  return rest;
}

describe("PATCH idempotency", () => {
  it("PATCH /api/v1/links/[id] is idempotent for note + originalUrl", async () => {
    // Create
    const createRes = await authenticatedFetch(`${BASE}/api/v1/links`, apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/idemp-link-1" }),
    });
    expect(createRes.status).toBe(201);
    const { link } = await createRes.json();

    const body = JSON.stringify({
      note: "stable note",
      originalUrl: "https://example.com/idemp-final",
    });

    const r1 = await authenticatedFetch(`${BASE}/api/v1/links/${link.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()).link;

    const r2 = await authenticatedFetch(`${BASE}/api/v1/links/${link.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()).link;

    expect(normalize(j2)).toEqual(normalize(j1));
    expect(j2.note).toBe("stable note");
    expect(j2.originalUrl).toBe("https://example.com/idemp-final");
  });

  it("PATCH /api/v1/links/[id] addTags does not produce duplicates on repeat", async () => {
    const createRes = await authenticatedFetch(`${BASE}/api/v1/links`, apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/idemp-link-tags" }),
    });
    const { link } = await createRes.json();
    const tag = await seedTag(TEST_USER_ID, { name: `idemp-${Date.now()}`, color: "#abcdef" });

    const body = JSON.stringify({ addTags: [tag.id] });

    await authenticatedFetch(`${BASE}/api/v1/links/${link.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const r2 = await authenticatedFetch(`${BASE}/api/v1/links/${link.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r2.status).toBe(200);

    // Verify only one row in link_tags — INSERT OR IGNORE protects us
    const rows = await queryD1<{ c: number }>(
      "SELECT COUNT(*) AS c FROM link_tags WHERE link_id = ? AND tag_id = ?",
      [link.id, tag.id],
    );
    expect(rows[0]?.c).toBe(1);
  });

  it("PATCH /api/v1/tags/[id] is idempotent for name + color", async () => {
    const tag = await seedTag(TEST_USER_ID, { name: "TagIdemp", color: "#112233" });
    const body = JSON.stringify({ name: "TagIdempUpdated", color: "#445566" });

    const r1 = await authenticatedFetch(`${BASE}/api/v1/tags/${tag.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()).tag;

    const r2 = await authenticatedFetch(`${BASE}/api/v1/tags/${tag.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()).tag;

    expect(normalize(j2)).toEqual(normalize(j1));
    expect(j2.name).toBe("TagIdempUpdated");
    expect(j2.color.toLowerCase()).toBe("#445566");
  });

  it("PATCH /api/v1/folders/[id] is idempotent for name + icon", async () => {
    // Create folder via API so we have its id in API response shape
    const createRes = await authenticatedFetch(`${BASE}/api/v1/folders`, apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "FolderIdemp", icon: "folder" }),
    });
    expect(createRes.status).toBe(201);
    const { folder } = await createRes.json();

    const body = JSON.stringify({ name: "FolderIdempRenamed", icon: "star" });

    const r1 = await authenticatedFetch(`${BASE}/api/v1/folders/${folder.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()).folder;

    const r2 = await authenticatedFetch(`${BASE}/api/v1/folders/${folder.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()).folder;

    expect(normalize(j2)).toEqual(normalize(j1));
    expect(j2.name).toBe("FolderIdempRenamed");
    expect(j2.icon).toBe("star");
  });

  it("PATCH /api/v1/ideas/[id] is idempotent for title + content + tags (replace)", async () => {
    const idea = await seedIdea(TEST_USER_ID, { title: "init", content: "initial" });
    const tag = await seedTag(TEST_USER_ID, { name: `idemp-idea-${Date.now()}`, color: "#abc123" });

    const body = JSON.stringify({
      title: "stable-title",
      content: "stable-content",
      tagIds: [tag.id],
    });

    const r1 = await authenticatedFetch(`${BASE}/api/v1/ideas/${idea.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()).idea;

    const r2 = await authenticatedFetch(`${BASE}/api/v1/ideas/${idea.id}`, apiKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()).idea;

    expect(normalize(j2)).toEqual(normalize(j1));
    expect(j2.title).toBe("stable-title");
    expect(j2.content).toBe("stable-content");

    // Verify only one row in idea_tags after two atomic-replace PATCHes
    const rows = await queryD1<{ c: number }>(
      "SELECT COUNT(*) AS c FROM idea_tags WHERE idea_id = ? AND tag_id = ?",
      [idea.id, tag.id],
    );
    expect(rows[0]?.c).toBe(1);
  });
});
