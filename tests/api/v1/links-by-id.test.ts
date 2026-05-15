/**
 * L2 E2E tests for /api/v1/links/[id] (GET-by-id, PATCH, DELETE).
 *
 * Split from links.test.ts to allow parallel execution with its own
 * isolated test user.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedApiKey, cleanupTestData, resetAndSeedUser, seedTag, executeD1 } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/links`;

const TEST_USER_ID = "api-v1-links-id-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;

describe("/api/v1/links/[id]", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "links:read,links:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "links:read" }),
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
  });

  describe("GET /api/v1/links/[id]", () => {
    let testLinkId: number;
    let testSlug: string;

    beforeAll(async () => {
      // Create a test link
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/test-get-by-id" }),
      });
      const body = await response.json();
      testLinkId = body.link.id;
      testSlug = body.link.slug;
    });

    it("returns 400 for invalid link ID", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/not-a-number`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid link ID");
    });

    it("returns 404 for non-existent link", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/999999999`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain("not found");
    });

    it("returns link details with correct structure", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.link.id).toBe(testLinkId);
      expect(body.link.slug).toBe(testSlug);
      expect(body.link).toHaveProperty("originalUrl");
      expect(body.link).toHaveProperty("shortUrl");
      expect(body.link).toHaveProperty("tagIds");
      expect(Array.isArray(body.link.tagIds)).toBe(true);
      expect(Array.isArray(body.link.tags)).toBe(true);
      expect(body.link.tags).toEqual([]);
    });

    it("returns tags array with correct id/name/color after PATCH addTags", async () => {
      // Create a fresh link so this test is independent from the shared one
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/test-get-tags" }),
      });
      const { link: created } = await createResponse.json();

      // Seed two tags and attach them via PATCH addTags
      const tagA = await seedTag(TEST_USER_ID, { name: `get-tag-a-${Date.now()}`, color: "#ff0000" });
      const tagB = await seedTag(TEST_USER_ID, { name: `get-tag-b-${Date.now()}`, color: "#00ff00" });

      const patchResponse = await authenticatedFetch(
        `${API_URL}/${created.id}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addTags: [tagA.id, tagB.id] }),
        },
      );
      expect(patchResponse.status).toBe(200);
      const patchBody = await patchResponse.json();
      expect(Array.isArray(patchBody.link.tags)).toBe(true);
      expect(patchBody.link.tags).toHaveLength(2);

      // Now GET the link and assert tags are present with id/name/color
      const getResponse = await authenticatedFetch(
        `${API_URL}/${created.id}`,
        apiKeyReadOnly,
      );
      expect(getResponse.status).toBe(200);
      const getBody = await getResponse.json();
      expect(Array.isArray(getBody.link.tags)).toBe(true);
      expect(getBody.link.tags).toHaveLength(2);

      const tagIds = getBody.link.tags.map((t: { id: string }) => t.id).sort();
      expect(tagIds).toEqual([tagA.id, tagB.id].sort());

      const tagById = new Map<string, { id: string; name: string; color: string }>(
        getBody.link.tags.map((t: { id: string; name: string; color: string }) => [t.id, t]),
      );
      expect(tagById.get(tagA.id)?.name).toBe(tagA.name);
      expect(tagById.get(tagA.id)?.color).toBe("#ff0000");
      expect(tagById.get(tagB.id)?.name).toBe(tagB.name);
      expect(tagById.get(tagB.id)?.color).toBe("#00ff00");

      // Cleanup
      await executeD1("DELETE FROM tags WHERE id IN (?, ?)", [tagA.id, tagB.id]);
    });
  });

  describe("DELETE /api/v1/links/[id]", () => {
    it("returns 403 when API key lacks links:write scope", async () => {
      // Create a link to delete
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/to-delete-403" }),
      });
      const { link } = await createResponse.json();

      const response = await authenticatedFetch(
        `${API_URL}/${link.id}`,
        apiKeyReadOnly,
        { method: "DELETE" },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent link", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/999999999`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(response.status).toBe(404);
    });

    it("deletes a link successfully", async () => {
      // Create a link to delete
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/to-delete-success" }),
      });
      const { link } = await createResponse.json();

      // Delete it
      const deleteResponse = await authenticatedFetch(
        `${API_URL}/${link.id}`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(deleteResponse.status).toBe(200);
      const body = await deleteResponse.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const getResponse = await authenticatedFetch(
        `${API_URL}/${link.id}`,
        apiKeyReadOnly,
      );
      expect(getResponse.status).toBe(404);
    });
  });

});
