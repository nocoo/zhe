/**
 * L2 E2E tests for /api/v1/folders/[id] endpoints (GET, PATCH, DELETE).
 *
 * Split from folders.test.ts to allow file-level parallelism in vitest.
 * Uses a separate test user ID to keep cleanup scoped per file.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedApiKey, cleanupTestData, resetAndSeedUser } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/folders`;

const TEST_USER_ID = "api-v1-folders-byid-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;

describe("/api/v1/folders/[id]", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "folders:read,folders:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "folders:read" }),
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
  });

  describe("GET /api/v1/folders/[id]", () => {
    let testFolderId: string;

    beforeAll(async () => {
      // Create a test folder
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Get By ID" }),
      });
      const body = await response.json();
      testFolderId = body.folder.id;
    });

    it("returns 404 for non-existent folder", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/non-existent-id`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain("not found");
    });

    it("returns folder details with correct structure", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testFolderId}`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.folder.id).toBe(testFolderId);
      expect(body.folder.name).toBe("Test Get By ID");
      expect(body.folder).toHaveProperty("icon");
      expect(body.folder).toHaveProperty("createdAt");
    });
  });

  describe("PATCH /api/v1/folders/[id]", () => {
    let testFolderId: string;

    beforeAll(async () => {
      // Create a test folder
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Patch" }),
      });
      const body = await response.json();
      testFolderId = body.folder.id;
    });

    it("returns 403 when API key lacks folders:write scope", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testFolderId}`,
        apiKeyReadOnly,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent folder", async () => {
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

    it("updates folder name", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testFolderId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Name" }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.folder.name).toBe("Updated Name");
    });

    it("updates folder icon", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testFolderId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icon: "archive" }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.folder.icon).toBe("archive");
    });

    it("returns 400 for empty name", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testFolderId}`,
        apiKeyWithReadWrite,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("empty");
    });
  });

  describe("DELETE /api/v1/folders/[id]", () => {
    it("returns 403 when API key lacks folders:write scope", async () => {
      // Create a folder to delete
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "To Delete 403" }),
      });
      const { folder } = await createResponse.json();

      const response = await authenticatedFetch(
        `${API_URL}/${folder.id}`,
        apiKeyReadOnly,
        { method: "DELETE" },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent folder", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/non-existent-id`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(response.status).toBe(404);
    });

    it("deletes a folder successfully", async () => {
      // Create a folder to delete
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "To Delete Success" }),
      });
      const { folder } = await createResponse.json();

      // Delete it
      const deleteResponse = await authenticatedFetch(
        `${API_URL}/${folder.id}`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(deleteResponse.status).toBe(200);
      const body = await deleteResponse.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const getResponse = await authenticatedFetch(
        `${API_URL}/${folder.id}`,
        apiKeyReadOnly,
      );
      expect(getResponse.status).toBe(404);
    });
  });
});
