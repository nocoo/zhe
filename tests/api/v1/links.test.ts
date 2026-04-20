/**
 * L2 E2E tests for /api/v1/links endpoint.
 *
 * These tests verify the complete API flow including authentication,
 * authorization, and business logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedTestUser, seedApiKey, cleanupTestData, resetAndSeedUser } from "../helpers/seed";

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
