/**
 * L2 E2E tests for PATCH /api/v1/links/[id].
 *
 * Split from links-by-id.test.ts because PATCH has many tag/expiry tests
 * with PATCH→GET round trips that dominate wall time.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedTestUser, seedApiKey, cleanupTestData, seedTag, executeD1 } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/links`;

const TEST_USER_ID = "api-v1-links-patch-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;

describe("/api/v1/links/[id] PATCH", () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_USER_ID);
    await seedTestUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "links:read,links:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "links:read" }),
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
  });

  describe("PATCH /api/v1/links/[id]", () => {
    let testLinkId: number;

    beforeAll(async () => {
      // Create a test link
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/test-patch" }),
      });
      const body = await response.json();
      testLinkId = body.link.id;
    });

    it("returns 403 when API key lacks links:write scope", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyReadOnly,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: "Updated note" }),
        },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent link", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/999999999`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: "Test" }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("updates link URL", async () => {
      const newUrl = "https://example.com/updated-url";
      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalUrl: newUrl }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.link.originalUrl).toBe(newUrl);
    });

    it("updates link note", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: "Updated via API" }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.link.note).toBe("Updated via API");
    });

    it("updates link slug", async () => {
      const newSlug = `patched-${Date.now()}`;
      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: newSlug }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.link.slug).toBe(newSlug);
      expect(body.link.isCustom).toBe(true);
    });

    it("returns 400 when addTags references non-existent tag", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addTags: ["non-existent-tag-id"] }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Tag not found");
    });

    it("returns 400 when removeTags references tag not associated with link", async () => {
      // Create a tag that exists but is not associated with the link
      const tag = await seedTag(TEST_USER_ID, { name: `orphan-tag-${Date.now()}` });

      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removeTags: [tag.id] }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Tag not associated with this link");

      // Cleanup
      await executeD1("DELETE FROM tags WHERE id = ?", [tag.id]);
    });

    it("successfully adds and removes tags from link", async () => {
      // Create a tag
      const tag = await seedTag(TEST_USER_ID, { name: `test-tag-${Date.now()}` });

      // Add tag to link
      const addResponse = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addTags: [tag.id] }),
        },
      );
      expect(addResponse.status).toBe(200);

      // Remove tag from link
      const removeResponse = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removeTags: [tag.id] }),
        },
      );
      expect(removeResponse.status).toBe(200);

      // Cleanup
      await executeD1("DELETE FROM tags WHERE id = ?", [tag.id]);
    });

    it("updates expiresAt correctly (stored as milliseconds)", async () => {
      // Set expiration to 1 year from now
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const isoDate = futureDate.toISOString();

      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresAt: isoDate }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // Verify the returned expiresAt is in the future (not 1970)
      const returnedDate = new Date(body.link.expiresAt);
      expect(returnedDate.getFullYear()).toBeGreaterThanOrEqual(new Date().getFullYear());

      // Verify it's within 1 minute of our target (allowing for test execution time)
      const diffMs = Math.abs(returnedDate.getTime() - futureDate.getTime());
      expect(diffMs).toBeLessThan(60000); // Within 1 minute
    });

    it("clears expiresAt when set to null", async () => {
      // First set an expiration
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresAt: futureDate.toISOString() }),
        },
      );

      // Now clear it
      const response = await authenticatedFetch(
        `${API_URL}/${testLinkId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresAt: null }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.link.expiresAt).toBeNull();
    });
  });

});
