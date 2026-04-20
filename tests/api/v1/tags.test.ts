/**
 * L2 E2E tests for /api/v1/tags endpoint.
 *
 * These tests verify the complete API flow including authentication,
 * authorization, and business logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedTestUser, seedApiKey, cleanupTestData, resetAndSeedUser, seedTag, executeD1 } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/tags`;

// Test user and API key setup
const TEST_USER_ID = "api-v1-tags-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
let apiKeyNoScopes: string;

describe("/api/v1/tags", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly, apiKeyNoScopes] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "tags:read,tags:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "tags:read" }),
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

    it("returns 401 when API key is invalid", async () => {
      const response = await fetch(API_URL, {
        headers: { Authorization: "Bearer zhe_invalid_key_12345" },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Invalid or revoked API key");
    });
  });

  describe("GET /api/v1/tags", () => {
    beforeAll(async () => {
      // Clean up any existing tags for this test user
      await executeD1("DELETE FROM tags WHERE user_id = ?", [TEST_USER_ID]);
    });

    it("returns 403 when API key lacks tags:read scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyNoScopes);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns empty array when user has no tags", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tags).toEqual([]);
    });

    it("returns tags with correct structure", async () => {
      // First create a tag
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Tag", color: "#ff5500" }),
      });
      expect(createResponse.status).toBe(201);

      // Then list tags
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tags).toBeInstanceOf(Array);
      expect(body.tags.length).toBeGreaterThan(0);

      const tag = body.tags[0];
      expect(tag).toHaveProperty("id");
      expect(tag).toHaveProperty("name");
      expect(tag).toHaveProperty("color");
      expect(tag).toHaveProperty("createdAt");
    });
  });

  describe("POST /api/v1/tags", () => {
    it("returns 403 when API key lacks tags:write scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Tag", color: "#ff5500" }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns 400 when name is missing", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: "#ff5500" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("name");
    });

    it("returns 400 when color is missing", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Tag" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("color");
    });

    it("returns 400 when color is invalid", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Tag", color: "invalid" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("hex");
    });

    it("creates tag with # prefix", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tag With Hash", color: "#00ff00" }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.tag.name).toBe("Tag With Hash");
      expect(body.tag.color).toBe("#00ff00");
    });

    it("creates tag without # prefix and normalizes", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tag Without Hash", color: "0000ff" }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.tag.name).toBe("Tag Without Hash");
      expect(body.tag.color).toBe("#0000ff");
    });
  });

  describe("GET /api/v1/tags/[id]", () => {
    let testTagId: string;

    beforeAll(async () => {
      // Seed a test tag
      const tag = await seedTag(TEST_USER_ID);
      testTagId = tag.id;
    });

    it("returns 404 for non-existent tag", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/non-existent-id`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain("not found");
    });

    it("returns tag details with correct structure", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testTagId}`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tag.id).toBe(testTagId);
      expect(body.tag).toHaveProperty("name");
      expect(body.tag).toHaveProperty("color");
      expect(body.tag).toHaveProperty("createdAt");
    });
  });

  describe("PATCH /api/v1/tags/[id]", () => {
    let testTagId: string;

    beforeAll(async () => {
      // Seed a test tag
      const tag = await seedTag(TEST_USER_ID);
      testTagId = tag.id;
    });

    it("returns 403 when API key lacks tags:write scope", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testTagId}`,
        apiKeyReadOnly,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent tag", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/non-existent-id`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("updates tag name", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testTagId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Name" }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tag.name).toBe("Updated Name");
    });

    it("updates tag color", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testTagId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: "aabbcc" }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tag.color).toBe("#aabbcc");
    });

    it("returns 400 for invalid color", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testTagId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: "not-a-color" }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("hex");
    });
  });

  describe("DELETE /api/v1/tags/[id]", () => {
    it("returns 403 when API key lacks tags:write scope", async () => {
      // Seed a tag to delete
      const tag = await seedTag(TEST_USER_ID);

      const response = await authenticatedFetch(
        `${API_URL}/${tag.id}`,
        apiKeyReadOnly,
        { method: "DELETE" },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent tag", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/non-existent-id`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(response.status).toBe(404);
    });

    it("deletes a tag successfully", async () => {
      // Seed a tag to delete
      const tag = await seedTag(TEST_USER_ID);

      // Delete it
      const deleteResponse = await authenticatedFetch(
        `${API_URL}/${tag.id}`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(deleteResponse.status).toBe(200);
      const body = await deleteResponse.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const getResponse = await authenticatedFetch(
        `${API_URL}/${tag.id}`,
        apiKeyReadOnly,
      );
      expect(getResponse.status).toBe(404);
    });
  });
});
