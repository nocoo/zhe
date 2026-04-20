/**
 * L2 E2E tests for /api/v1/links/[id] (GET-by-id, PATCH, DELETE).
 *
 * Split from links.test.ts to allow parallel execution with its own
 * isolated test user.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedTestUser, seedApiKey, cleanupTestData, resetAndSeedUser } from "../helpers/seed";

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
