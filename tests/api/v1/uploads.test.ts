/**
 * L2 E2E tests for /api/v1/uploads endpoint.
 *
 * These tests verify the complete API flow including authentication,
 * authorization, and business logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedTestUser, seedApiKey, cleanupTestData, seedUpload } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/uploads`;

// Test user and API key setup
const TEST_USER_ID = "api-v1-uploads-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
let apiKeyNoScopes: string;

describe("/api/v1/uploads", () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_USER_ID);
    await seedTestUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly, apiKeyNoScopes] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "uploads:read,uploads:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "uploads:read" }),
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

  describe("GET /api/v1/uploads", () => {
    it("returns 403 when API key lacks uploads:read scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyNoScopes);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns empty array when user has no uploads", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.uploads).toEqual([]);
    });

    it("returns uploads with correct structure", async () => {
      // Seed an upload
      const upload = await seedUpload(TEST_USER_ID);

      // List uploads
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.uploads).toBeInstanceOf(Array);
      expect(body.uploads.length).toBeGreaterThan(0);

      const found = body.uploads.find((u: { id: number }) => u.id === upload.id);
      expect(found).toBeDefined();
      expect(found).toHaveProperty("id");
      expect(found).toHaveProperty("key");
      expect(found).toHaveProperty("fileName");
      expect(found).toHaveProperty("fileType");
      expect(found).toHaveProperty("fileSize");
      expect(found).toHaveProperty("publicUrl");
      expect(found).toHaveProperty("createdAt");
    });
  });

  describe("GET /api/v1/uploads/[id]", () => {
    let testUploadId: number;

    beforeAll(async () => {
      // Seed a test upload
      const upload = await seedUpload(TEST_USER_ID);
      testUploadId = upload.id;
    });

    it("returns 400 for invalid upload ID", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/not-a-number`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid upload ID");
    });

    it("returns 404 for non-existent upload", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/999999999`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain("not found");
    });

    it("returns upload details with correct structure", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/${testUploadId}`,
        apiKeyReadOnly,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.upload.id).toBe(testUploadId);
      expect(body.upload).toHaveProperty("key");
      expect(body.upload).toHaveProperty("fileName");
      expect(body.upload).toHaveProperty("fileType");
      expect(body.upload).toHaveProperty("fileSize");
      expect(body.upload).toHaveProperty("publicUrl");
      expect(body.upload).toHaveProperty("createdAt");
    });
  });

  describe("DELETE /api/v1/uploads/[id]", () => {
    it("returns 403 when API key lacks uploads:write scope", async () => {
      // Seed an upload to delete
      const upload = await seedUpload(TEST_USER_ID);

      const response = await authenticatedFetch(
        `${API_URL}/${upload.id}`,
        apiKeyReadOnly,
        { method: "DELETE" },
      );

      expect(response.status).toBe(403);
    });

    it("returns 400 for invalid upload ID", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/not-a-number`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid upload ID");
    });

    it("returns 404 for non-existent upload", async () => {
      const response = await authenticatedFetch(
        `${API_URL}/999999999`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(response.status).toBe(404);
    });

    it("deletes an upload successfully", async () => {
      // Seed an upload to delete
      const upload = await seedUpload(TEST_USER_ID);

      // Delete it
      const deleteResponse = await authenticatedFetch(
        `${API_URL}/${upload.id}`,
        apiKeyWithReadWrite,
        { method: "DELETE" },
      );

      expect(deleteResponse.status).toBe(200);
      const body = await deleteResponse.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const getResponse = await authenticatedFetch(
        `${API_URL}/${upload.id}`,
        apiKeyReadOnly,
      );
      expect(getResponse.status).toBe(404);
    });
  });
});
