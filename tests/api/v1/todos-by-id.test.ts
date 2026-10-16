/**
 * L2 E2E tests for /api/v1/todos/[id], move, reorder.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticatedFetch, getBaseUrl } from "../helpers/api-client";
import {
  cleanupTestData,
  resetAndSeedUser,
  seedApiKey,
  seedTestUser,
  seedTodo,
} from "../helpers/seed";

const API_URL = `${getBaseUrl()}/api/v1/todos`;

const TEST_USER_ID = "api-v1-todos-id-test-user";
const OTHER_USER_ID = "api-v1-todos-other-user";
let apiKeyWithReadWrite: string;
let apiKeyReadOnly: string;
describe("/api/v1/todos/[id]", () => {
  beforeAll(async () => {
    await resetAndSeedUser(TEST_USER_ID);
    await seedTestUser(OTHER_USER_ID);
    [apiKeyWithReadWrite, apiKeyReadOnly] = await Promise.all([
      seedApiKey(TEST_USER_ID, { name: "Full Access", scopes: "todos:read,todos:write" }),
      seedApiKey(TEST_USER_ID, { name: "Read Only", scopes: "todos:read" }),
      seedApiKey(OTHER_USER_ID, { name: "Other", scopes: "todos:read,todos:write" }),
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(TEST_USER_ID);
    await cleanupTestData(OTHER_USER_ID);
  });

  it("returns 404 for another user's todo (ownership)", async () => {
    const otherTodo = await seedTodo(OTHER_USER_ID, { title: "Private" });
    const response = await authenticatedFetch(`${API_URL}/${otherTodo.id}`, apiKeyReadOnly);
    expect(response.status).toBe(404);
  });

  describe("GET detail", () => {
    it("returns todo detail with content", async () => {
      const seeded = await seedTodo(TEST_USER_ID, { title: "Detail", content: "Body" });
      const response = await authenticatedFetch(`${API_URL}/${seeded.id}`, apiKeyReadOnly);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todo.content).toBe("Body");
      expect(body.todo.doneAt).toBeNull();
    });

    it("returns 400 for invalid id", async () => {
      const response = await authenticatedFetch(`${API_URL}/abc`, apiKeyReadOnly);
      expect(response.status).toBe(400);
    });

    it("returns 400 for partial-parse id (does not delete another todo)", async () => {
      const seeded = await seedTodo(TEST_USER_ID, { title: "Real one" });
      const response = await authenticatedFetch(`${API_URL}/1foreign`, apiKeyReadOnly);
      expect(response.status).toBe(400);
      const stillThere = await authenticatedFetch(`${API_URL}/${seeded.id}`, apiKeyReadOnly);
      expect(stillThere.status).toBe(200);
    });
  });

  describe("PATCH", () => {
    it("returns 403 without write scope", async () => {
      const seeded = await seedTodo(TEST_USER_ID, { title: "Patch me" });
      const response = await authenticatedFetch(`${API_URL}/${seeded.id}`, apiKeyReadOnly, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      expect(response.status).toBe(403);
    });

    it("updates fields", async () => {
      const seeded = await seedTodo(TEST_USER_ID, { title: "Before" });
      const response = await authenticatedFetch(`${API_URL}/${seeded.id}`, apiKeyWithReadWrite, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "After", done: true }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todo.title).toBe("After");
      expect(body.todo.done).toBe(true);
    });
  });

  describe("DELETE", () => {
    it("deletes todo", async () => {
      const seeded = await seedTodo(TEST_USER_ID, { title: "Gone" });
      const del = await authenticatedFetch(`${API_URL}/${seeded.id}`, apiKeyWithReadWrite, {
        method: "DELETE",
      });
      expect(del.status).toBe(200);
      const get = await authenticatedFetch(`${API_URL}/${seeded.id}`, apiKeyReadOnly);
      expect(get.status).toBe(404);
    });
  });

  describe("POST move", () => {
    it("moves todo under a parent", async () => {
      const parent = await seedTodo(TEST_USER_ID, { title: "Parent", position: 0 });
      const child = await seedTodo(TEST_USER_ID, { title: "Child", position: 0 });

      const response = await authenticatedFetch(
        `${API_URL}/${child.id}/move`,
        apiKeyWithReadWrite,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: parent.id, position: 0 }),
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.move.newParentId).toBe(parent.id);
    });
  });

  describe("POST reorder", () => {
    it("reorders siblings", async () => {
      const a = await seedTodo(TEST_USER_ID, { title: "Reorder A", position: 0 });
      const b = await seedTodo(TEST_USER_ID, { title: "Reorder B", position: 1 });

      const listRes = await authenticatedFetch(API_URL, apiKeyReadOnly);
      const listBody = await listRes.json();
      const rootIds = (listBody.todos as { id: number; parentId: number | null }[])
        .filter((t) => t.parentId === null)
        .sort((x, y) => x.id - y.id)
        .map((t) => t.id);

      expect(rootIds).toContain(a.id);
      expect(rootIds).toContain(b.id);

      const orderedIds = [...rootIds];
      const ai = orderedIds.indexOf(a.id);
      const bi = orderedIds.indexOf(b.id);
      expect(ai).toBeGreaterThanOrEqual(0);
      expect(bi).toBeGreaterThanOrEqual(0);
      const aVal = orderedIds[ai] as number;
      const bVal = orderedIds[bi] as number;
      orderedIds[ai] = bVal;
      orderedIds[bi] = aVal;

      const response = await authenticatedFetch(`${API_URL}/reorder`, apiKeyWithReadWrite, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: null, orderedIds }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.orderedIds).toEqual(orderedIds);
    });
  });
});
