/**
 * L2 E2E tests for PATCH /api/v1/ideas/[id].
 *
 * Split from ideas-by-id.test.ts to parallelize the heavy PATCH suite.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import {
  seedTestUser,
  seedApiKey,
  cleanupTestData,
  resetAndSeedUser,
  seedTag,
  seedIdea,
} from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/ideas`;

const TEST_USER_ID = "api-v1-ideas-patch-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;

describe("/api/v1/ideas/[id] PATCH", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "ideas:read,ideas:write,tags:read,tags:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "ideas:read" }),
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
  });

  describe("PATCH /api/v1/ideas/[id]", () => {
    let testIdeaId: number;

    beforeAll(async () => {
      // Seed a test idea
      const idea = await seedIdea(TEST_USER_ID, {
        title: "Patch Test Idea",
        content: "Original content",
      });
      testIdeaId = idea.id;
    });

    it("returns 403 when API key lacks ideas:write scope", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyReadOnly,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent idea", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/9999999`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Test" }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("updates idea title", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated Title" }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.idea.title).toBe("Updated Title");
    });

    it("sets title to null", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: null }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.idea.title).toBeNull();
    });

    it("updates idea content", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "# New Content\n\nUpdated body." }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.idea.content).toBe("# New Content\n\nUpdated body.");
      expect(body.idea.excerpt).toBe("New Content Updated body.");
    });

    it("returns 400 for empty content", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "   " }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("empty");
    });

    it("updates idea tags atomically", async () => {
      // Seed tags
      const tag1 = await seedTag(TEST_USER_ID, { name: "patch-tag-1" });
      const tag2 = await seedTag(TEST_USER_ID, { name: "patch-tag-2" });

      // First set some tags
      await authenticatedFetch(`${API_URL}/${testIdeaId}`, apiKeyWithReadWrite, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: [tag1.id] }),
      });

      // Then replace with different tags
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagIds: [tag2.id] }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.idea.tagIds).toHaveLength(1);
      expect(body.idea.tagIds).toContain(tag2.id);
      expect(body.idea.tagIds).not.toContain(tag1.id);
    });

    it("clears all tags with null", async () => {
      const tag = await seedTag(TEST_USER_ID, { name: "clear-tag" });

      // Set a tag
      await authenticatedFetch(`${API_URL}/${testIdeaId}`, apiKeyWithReadWrite, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: [tag.id] }),
      });

      // Clear with null
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagIds: null }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.idea.tagIds).toEqual([]);
    });

    it("returns 400 for invalid tag IDs", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagIds: ["non-existent"] }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid tag IDs");
    });
  });

});
