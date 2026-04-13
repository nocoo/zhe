/**
 * L2 E2E tests for /api/v1/links endpoint.
 *
 * These tests verify the complete API flow including authentication,
 * authorization, and business logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedTestUser, seedApiKey, cleanupTestData, seedTag, executeD1 } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/links`;

// Test user and API key setup
const TEST_USER_ID = "api-v1-links-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
let apiKeyNoScopes: string;

describe("/api/v1/links", () => {
  beforeAll(async () => {
    // Seed test user
    await seedTestUser(TEST_USER_ID);

    // Seed API keys with different scopes
    apiKeyWithReadWrite = await seedApiKey(TEST_USER_ID, {
      name: "Full Access",
      scopes: "links:read,links:write",
    });

    apiKeyReadOnly = await seedApiKey(TEST_USER_ID, {
      name: "Read Only",
      scopes: "links:read",
    });

    apiKeyNoScopes = await seedApiKey(TEST_USER_ID, {
      name: "No Scopes",
      scopes: "",
    });
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
  });

  describe("Authentication", () => {
    it("returns 401 when no Authorization header", async () => {
      const response = await fetch(API_URL);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Missing Authorization header");
    });

    it("returns 401 when Authorization header is not Bearer", async () => {
      const response = await fetch(API_URL, {
        headers: { Authorization: "Basic abc123" },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Invalid Authorization header format");
    });

    it("returns 401 when API key is invalid", async () => {
      const response = await fetch(API_URL, {
        headers: { Authorization: "Bearer zhe_invalid_key_12345" },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Invalid or revoked API key");
    });
  });

  describe("GET /api/v1/links", () => {
    it("returns 403 when API key lacks links:read scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyNoScopes);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns empty array when user has no links", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.links).toEqual([]);
    });

    it("returns links with correct structure", async () => {
      // First create a link
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/test-list" }),
      });
      expect(createResponse.status).toBe(201);

      // Then list links
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.links).toBeInstanceOf(Array);
      expect(body.links.length).toBeGreaterThan(0);

      const link = body.links[0];
      expect(link).toHaveProperty("id");
      expect(link).toHaveProperty("slug");
      expect(link).toHaveProperty("originalUrl");
      expect(link).toHaveProperty("shortUrl");
      expect(link).toHaveProperty("createdAt");
      expect(link.shortUrl).toMatch(/^https:\/\/zhe\.to\//);
    });

    it("supports pagination with limit and offset", async () => {
      const response = await authenticatedFetch(`${API_URL}?limit=5&offset=0`, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.links.length).toBeLessThanOrEqual(5);
    });

    it("supports sorting by clicks", async () => {
      const response = await authenticatedFetch(`${API_URL}?sort=clicks&order=desc`, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.links)).toBe(true);
      // Verify descending order by clicks
      for (let i = 1; i < body.links.length; i++) {
        expect(body.links[i - 1].clicks).toBeGreaterThanOrEqual(body.links[i].clicks);
      }
    });

    it("supports sorting by created date ascending", async () => {
      const response = await authenticatedFetch(`${API_URL}?sort=created&order=asc`, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.links)).toBe(true);
      // Verify ascending order by createdAt
      for (let i = 1; i < body.links.length; i++) {
        expect(new Date(body.links[i - 1].createdAt).getTime())
          .toBeLessThanOrEqual(new Date(body.links[i].createdAt).getTime());
      }
    });

    it("returns 400 for invalid sort value", async () => {
      const response = await authenticatedFetch(`${API_URL}?sort=invalid`, apiKeyReadOnly);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid sort value");
    });

    it("returns 400 for invalid order value", async () => {
      const response = await authenticatedFetch(`${API_URL}?order=invalid`, apiKeyReadOnly);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid order value");
    });
  });

  describe("POST /api/v1/links", () => {
    it("returns 403 when API key lacks links:write scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns 400 when url is missing", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("url");
    });

    it("returns 400 when url is invalid", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "not-a-valid-url" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid URL format");
    });

    it("creates link with auto-generated slug", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/auto-slug-test" }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.link).toHaveProperty("slug");
      expect(body.link.slug.length).toBeGreaterThanOrEqual(6);
      expect(body.link.isCustom).toBe(false);
    });

    it("creates link with custom slug", async () => {
      const customSlug = `custom-${Date.now()}`;
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/custom-slug-test",
          slug: customSlug,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.link.slug).toBe(customSlug);
      expect(body.link.isCustom).toBe(true);
    });

    it("returns 409 when custom slug already exists", async () => {
      const slug = `conflict-${Date.now()}`;

      // Create first link
      const first = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/first", slug }),
      });
      expect(first.status).toBe(201);

      // Try to create second with same slug
      const second = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/second", slug }),
      });

      expect(second.status).toBe(409);
      const body = await second.json();
      expect(body.error).toContain("already in use");
    });

    it("returns 400 for invalid custom slug format", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com",
          slug: "invalid slug with spaces!",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid slug format");
    });

    it("creates link with note", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/with-note",
          note: "Test note for API",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.link.note).toBe("Test note for API");
    });

    it("creates link with expiration", async () => {
      const expiresAt = new Date(Date.now() + 86400000).toISOString(); // +1 day
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/with-expiry",
          expiresAt,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.link.expiresAt).toBeDefined();
    });

    it("returns 400 for past expiration date", async () => {
      const expiresAt = new Date(Date.now() - 86400000).toISOString(); // -1 day
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/past-expiry",
          expiresAt,
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("future");
    });
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
    });
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

  describe("Rate Limiting", () => {
    it("returns rate limit headers on successful request", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("returns rate limit headers on POST request", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/rate-limit-test" }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });
  });
});
