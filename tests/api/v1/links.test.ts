/**
 * L2 E2E tests for /api/v1/links endpoint.
 *
 * These tests verify the complete API flow including authentication,
 * authorization, and business logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedApiKey, cleanupTestData, resetAndSeedUser, seedTag, executeD1 } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/links`;

// Test user and API key setup
const TEST_USER_ID = "api-v1-links-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
let apiKeyNoScopes: string;

describe("/api/v1/links", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly, apiKeyNoScopes] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "links:read,links:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "links:read" }),
      seedApiKey(TEST_USER_ID, { name: "No Scopes",   scopes: "" }),
    ]);
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
      expect(link).toHaveProperty("tagIds");
      expect(Array.isArray(link.tagIds)).toBe(true);
      expect(link).toHaveProperty("tags");
      expect(Array.isArray(link.tags)).toBe(true);
      expect(link.shortUrl).toMatch(/^https:\/\/zhe\.to\//);
    });

    it("returns per-link tags arrays for a mix of tagged and untagged links", async () => {
      // Create two fresh links
      const createA = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/list-tags-a" }),
      });
      const { link: linkA } = await createA.json();

      const createB = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/list-tags-b" }),
      });
      const { link: linkB } = await createB.json();

      // Tag only the first link
      const tag = await seedTag(TEST_USER_ID, { name: `list-tag-${Date.now()}`, color: "#1234ab" });
      const patchResponse = await authenticatedFetch(
        `${API_URL}/${linkA.id}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addTags: [tag.id] }),
        },
      );
      expect(patchResponse.status).toBe(200);

      // List a generous page so both links are present
      const listResponse = await authenticatedFetch(`${API_URL}?limit=100`, apiKeyReadOnly);
      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json();

      const byId = new Map<number, { id: number; tags: { id: string; name: string; color: string }[] }>(
        listBody.links.map((l: { id: number; tags: { id: string; name: string; color: string }[] }) => [l.id, l]),
      );
      const fetchedA = byId.get(linkA.id);
      const fetchedB = byId.get(linkB.id);
      expect(fetchedA).toBeDefined();
      expect(fetchedB).toBeDefined();

      expect(Array.isArray(fetchedA?.tags)).toBe(true);
      expect(fetchedA?.tags).toHaveLength(1);
      expect(fetchedA?.tags[0]?.id).toBe(tag.id);
      expect(fetchedA?.tags[0]?.name).toBe(tag.name);
      expect(fetchedA?.tags[0]?.color).toBe("#1234ab");

      expect(Array.isArray(fetchedB?.tags)).toBe(true);
      expect(fetchedB?.tags).toEqual([]);

      // Cleanup
      await executeD1("DELETE FROM tags WHERE id = ?", [tag.id]);
    });

    it("supports pagination with limit and offset", async () => {
      const response = await authenticatedFetch(`${API_URL}?limit=5&offset=0`, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.links.length).toBeLessThanOrEqual(5);
      expect(typeof body.total).toBe("number");
      expect(body.total).toBeGreaterThanOrEqual(body.links.length);
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

});
