/**
 * L2 E2E tests for /api/v1/ideas/[id] (GET-by-id, PATCH, DELETE).
 *
 * Split from ideas.test.ts to allow parallel execution. Uses its own
 * isolated test user so cleanup of one file does not race with the other.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import {
  seedTestUser,
  seedApiKey,
  cleanupTestData,
  resetAndSeedUser,
  seedIdea,
} from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/ideas`;

const TEST_USER_ID = "api-v1-ideas-id-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;

describe("/api/v1/ideas/[id]", () => {
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

  describe("GET /api/v1/ideas/[id]", () => {
    let testIdeaId: number;

    beforeAll(async () => {
      // Seed a test idea
      const idea = await seedIdea(TEST_USER_ID, {
        title: "Detail Test Idea",
        content: "Full content for detail view",
      });
      testIdeaId = idea.id;
    });

    it("returns 404 for non-existent idea", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/9999999`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain("not found");
    });

    it("returns 400 for invalid idea ID", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/not-a-number`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid idea ID");
    });

    it("returns idea details with full content", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testIdeaId}`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.idea.id).toBe(testIdeaId);
      expect(body.idea.title).toBe("Detail Test Idea");
      expect(body.idea.content).toBe("Full content for detail view");
      expect(body.idea).toHaveProperty("excerpt");
      expect(body.idea).toHaveProperty("tagIds");
      expect(body.idea).toHaveProperty("createdAt");
      expect(body.idea).toHaveProperty("updatedAt");
    });
  });

  describe("DELETE /api/v1/ideas/[id]", () => {
    it("returns 403 when API key lacks ideas:write scope", async () => {
      // Seed an idea to delete
      const idea = await seedIdea(TEST_USER_ID, { content: "To delete" });

      const response = await authenticatedFetch(
        `${API_URL}/${idea.id}`,
        apiKeyReadOnly,
        { method: "DELETE" },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent idea", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/9999999`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(response.status).toBe(404);
    });

    it("deletes an idea successfully", async () => {
      // Seed an idea to delete
      const idea = await seedIdea(TEST_USER_ID, { content: "Delete me" });

      // Delete it
      const deleteResponse = await authenticatedFetch(
        `${API_URL}/${idea.id}`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(deleteResponse.status).toBe(200);
      const body = await deleteResponse.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const getResponse = await authenticatedFetch(
        `${API_URL}/${idea.id}`,
        apiKeyReadOnly,
      );
      expect(getResponse.status).toBe(404);
    });
  });
});
