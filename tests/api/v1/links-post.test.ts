/**
 * L2 E2E tests for POST /api/v1/links + Rate Limiting headers.
 *
 * Split from links.test.ts for file-level parallelism. Uses a separate
 * test user ID so cleanup doesn't race with links.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedApiKey, cleanupTestData, resetAndSeedUser } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/links`;

const TEST_USER_ID = "api-v1-links-post-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;

describe("/api/v1/links POST + rate-limit", () => {
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
