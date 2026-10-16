/**
 * L2 E2E tests for /api/v1/todos endpoint.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticatedFetch, getBaseUrl } from "../helpers/api-client";
import {
  cleanupTestData,
  executeD1,
  resetAndSeedUser,
  seedApiKey,
  seedTodo,
} from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/todos`;
const TAGS_URL = `${getBaseUrl()}/api/v1/todos/tags`;

const TEST_USER_ID = "api-v1-todos-test-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
let apiKeyNoScopes: string;

describe("/api/v1/todos", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly, apiKeyNoScopes] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "todos:read,todos:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only", scopes: "todos:read" }),
      seedApiKey(TEST_USER_ID, { name: "No Scopes", scopes: "" }),
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
  });

  describe("Authentication", () => {
    it("returns 401 when no Authorization header", async () => {
      const response = await fetch(API_URL);
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/todos", () => {
    beforeAll(async () => {
      await executeD1(
        "DELETE FROM todo_tags WHERE todo_id IN (SELECT id FROM todos WHERE user_id = ?)",
        [TEST_USER_ID],
      );
      await executeD1("DELETE FROM todos WHERE user_id = ?", [TEST_USER_ID]);
    });

    it("returns 403 when API key lacks todos:read scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyNoScopes);
      expect(response.status).toBe(403);
    });

    it("returns empty list when user has no todos", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todos).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns todos with tree node shape", async () => {
      await seedTodo(TEST_USER_ID, { title: "Ship API", tagNames: ["work"] });

      const response = await authenticatedFetch(API_URL, apiKeyReadOnly);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todos.length).toBeGreaterThanOrEqual(1);
      const row = body.todos.find((t: { title: string }) => t.title === "Ship API");
      expect(row).toMatchObject({
        title: "Ship API",
        done: false,
        parentId: null,
        tagNames: ["work"],
      });
      expect(row).toHaveProperty("createdAt");
      expect(row).not.toHaveProperty("content");
    });
  });

  describe("GET /api/v1/todos/tags", () => {
    it("returns distinct tag names", async () => {
      const response = await authenticatedFetch(TAGS_URL, apiKeyReadOnly);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tags).toContain("work");
    });
  });

  describe("POST /api/v1/todos", () => {
    it("returns 403 when API key lacks todos:write scope", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyReadOnly, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nope" }),
      });
      expect(response.status).toBe(403);
    });

    it("returns 400 when title is missing", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });

    it("creates a todo and returns detail shape", async () => {
      const response = await authenticatedFetch(API_URL, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New task", content: "Notes", dueAtMs: 1_700_000_000_000 }),
      });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.todo.title).toBe("New task");
      expect(body.todo.content).toBe("Notes");
      expect(body.todo.dueAt).toBeTruthy();
    });
  });
});
