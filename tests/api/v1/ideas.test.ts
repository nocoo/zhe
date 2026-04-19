/**
 * L2 E2E tests for /api/v1/ideas endpoint.
 *
 * These tests verify the complete API flow including authentication,
 * authorization, and business logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import {
  seedTestUser,
  seedApiKey,
  cleanupTestData,
  seedTag,
  seedIdea,
  executeD1,
} from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/ideas`;

// Test user and API key setup
const TEST_USER_ID = "api-v1-ideas-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
let apiKeyNoScopes: string;

describe("/api/v1/ideas", () => {
  beforeAll(async () => {
    // Clean up first to ensure fresh state
    await cleanupTestData(TEST_USER_ID);

    // Seed test user
    await seedTestUser(TEST_USER_ID);

    // Seed API keys with different scopes
    apiKeyWithReadWrite = await seedApiKey(TEST_USER_ID, {
      name: "Full Access",
      scopes: "ideas:read,ideas:write,tags:read,tags:write",
    });

    apiKeyReadOnly = await seedApiKey(TEST_USER_ID, {
      name: "Read Only",
      scopes: "ideas:read",
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

    it("returns 401 when API key is invalid", async () => {
      const response = await fetch(API_URL, {
        headers: { Authorization: "Bearer zhe_invalid_key_12345" },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Invalid or revoked API key");
    });
  });

  describe("GET /api/v1/ideas", () => {
    beforeAll(async () => {
      // Clean up any existing ideas for this test user
      await executeD1("DELETE FROM ideas WHERE user_id = ?", [TEST_USER_ID]);
    });

    it("returns 403 when API key lacks ideas:read scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyNoScopes);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns empty array when user has no ideas", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ideas).toEqual([]);
    });

    it("returns ideas with correct list structure", async () => {
      // First create an idea
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "# Test Idea\n\nSome markdown content" }),
      });
      expect(createResponse.status).toBe(201);

      // Then list ideas
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ideas).toBeInstanceOf(Array);
      expect(body.ideas.length).toBeGreaterThan(0);

      const idea = body.ideas[0];
      expect(idea).toHaveProperty("id");
      expect(idea).toHaveProperty("title");
      expect(idea).toHaveProperty("excerpt");
      expect(idea).toHaveProperty("tagIds");
      expect(idea).toHaveProperty("createdAt");
      expect(idea).toHaveProperty("updatedAt");
      // List shape should NOT include full content
      expect(idea).not.toHaveProperty("content");
    });

    it("filters ideas by query", async () => {
      // Clean and create specific test data
      await executeD1("DELETE FROM ideas WHERE user_id = ?", [TEST_USER_ID]);

      await seedIdea(TEST_USER_ID, { content: "Alpha bravo charlie" });
      await seedIdea(TEST_USER_ID, { content: "Delta echo foxtrot" });

      const response = await authenticatedFetch(
        `${API_URL}?q=bravo`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ideas).toHaveLength(1);
      expect(body.ideas[0].excerpt).toContain("bravo");
    });

    it("filters ideas by tagId", async () => {
      // Clean and create specific test data
      await executeD1("DELETE FROM ideas WHERE user_id = ?", [TEST_USER_ID]);

      const tag = await seedTag(TEST_USER_ID, { name: "filter-tag" });
      await seedIdea(TEST_USER_ID, { content: "Tagged idea", tagIds: [tag.id] });
      await seedIdea(TEST_USER_ID, { content: "Untagged idea" });

      const response = await authenticatedFetch(
        `${API_URL}?tagId=${tag.id}`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ideas).toHaveLength(1);
      expect(body.ideas[0].tagIds).toContain(tag.id);
    });

    it("supports pagination with limit and offset", async () => {
      // Clean and create specific test data
      await executeD1("DELETE FROM ideas WHERE user_id = ?", [TEST_USER_ID]);

      for (let i = 0; i < 5; i++) {
        await seedIdea(TEST_USER_ID, { content: `Idea ${i}` });
      }

      const response = await authenticatedFetch(
        `${API_URL}?limit=2&offset=1`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ideas).toHaveLength(2);
    });
  });

  describe("POST /api/v1/ideas", () => {
    it("returns 403 when API key lacks ideas:write scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Test content" }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns 400 when content is missing", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "No content" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("content");
    });

    it("returns 400 when content is empty", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "   " }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("empty");
    });

    it("creates idea with content only", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "# Simple Idea\n\nJust content." }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.idea.content).toBe("# Simple Idea\n\nJust content.");
      expect(body.idea.title).toBeNull();
      expect(body.idea.excerpt).toBe("Simple Idea Just content.");
      expect(body.idea.tagIds).toEqual([]);
    });

    it("creates idea with title", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Body text",
          title: "My Idea Title",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.idea.title).toBe("My Idea Title");
      expect(body.idea.content).toBe("Body text");
    });

    it("creates idea with tags", async () => {
      // Create tags via API to ensure data consistency with the server
      const tag1Response = await authenticatedFetch(
        `${getBaseUrl()}/api/v1/tags`,
        apiKeyWithReadWrite,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "api-tag-1", color: "#ff5500" }),
        },
      );
      expect(tag1Response.status).toBe(201);
      const tag1 = (await tag1Response.json()).tag;

      const tag2Response = await authenticatedFetch(
        `${getBaseUrl()}/api/v1/tags`,
        apiKeyWithReadWrite,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "api-tag-2", color: "#0055ff" }),
        },
      );
      expect(tag2Response.status).toBe(201);
      const tag2 = (await tag2Response.json()).tag;

      // Create idea with tags
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Tagged idea via API",
          tagIds: [tag1.id, tag2.id],
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.idea.tagIds).toHaveLength(2);
      expect(body.idea.tagIds).toContain(tag1.id);
      expect(body.idea.tagIds).toContain(tag2.id);
    });

    it("returns 400 for invalid tag IDs", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Idea with bad tags",
          tagIds: ["non-existent-tag"],
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid tag IDs");
    });
  });

});
