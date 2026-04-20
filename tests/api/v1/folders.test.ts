/**
 * L2 E2E tests for /api/v1/folders endpoint.
 *
 * These tests verify the complete API flow including authentication,
 * authorization, and business logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getBaseUrl, authenticatedFetch } from "../helpers/api-client";
import { seedApiKey, cleanupTestData, resetAndSeedUser } from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/folders`;

// Test user and API key setup
const TEST_USER_ID = "api-v1-folders-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
let apiKeyNoScopes: string;

describe("/api/v1/folders", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly, apiKeyNoScopes] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "folders:read,folders:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only",   scopes: "folders:read" }),
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

  describe("GET /api/v1/folders", () => {
    it("returns 403 when API key lacks folders:read scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyNoScopes);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns empty array when user has no folders", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.folders).toEqual([]);
    });

    it("returns folders with correct structure", async () => {
      // First create a folder
      const createResponse = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Folder" }),
      });
      expect(createResponse.status).toBe(201);

      // Then list folders
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.folders).toBeInstanceOf(Array);
      expect(body.folders.length).toBeGreaterThan(0);

      const folder = body.folders[0];
      expect(folder).toHaveProperty("id");
      expect(folder).toHaveProperty("name");
      expect(folder).toHaveProperty("icon");
      expect(folder).toHaveProperty("createdAt");
    });
  });

  describe("POST /api/v1/folders", () => {
    it("returns 403 when API key lacks folders:write scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Folder" }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns 400 when name is missing", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("name");
    });

    it("returns 400 when name is empty", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("empty");
    });

    it("returns 400 when name is too long", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x".repeat(101) }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("100 characters");
    });

    it("creates folder with default icon", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Default Icon Folder" }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.folder.name).toBe("Default Icon Folder");
      expect(body.folder.icon).toBe("folder");
    });

    it("creates folder with custom icon", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Custom Icon Folder", icon: "star" }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.folder.name).toBe("Custom Icon Folder");
      expect(body.folder.icon).toBe("star");
    });
  });

});
