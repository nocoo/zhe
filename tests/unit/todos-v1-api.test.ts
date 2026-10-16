// @vitest-environment node

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAuth = vi.fn();
const mockGetTodos = vi.fn();
const mockGetTodoById = vi.fn();
const mockCreateTodo = vi.fn();
const mockUpdateTodo = vi.fn();
const mockDeleteTodo = vi.fn();
const mockMoveTodo = vi.fn();
const mockReorderSiblings = vi.fn();
const mockGetTodoTags = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  apiError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  requireAuthWithRateLimit: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/api/audit", () => ({
  logApiRequest: vi.fn(),
}));

vi.mock("@/lib/db/scoped", () => ({
  ScopedDB: vi.fn().mockImplementation(function () {
    return {
      getTodos: mockGetTodos,
      getTodoById: mockGetTodoById,
      createTodo: mockCreateTodo,
      updateTodo: mockUpdateTodo,
      deleteTodo: mockDeleteTodo,
      moveTodo: mockMoveTodo,
      reorderSiblings: mockReorderSiblings,
      getTodoTags: mockGetTodoTags,
    };
  }),
}));

import { POST as moveTodo } from "@/app/api/v1/todos/[id]/move/route";
import {
  DELETE as deleteTodo,
  GET as getTodo,
  PATCH as patchTodo,
} from "@/app/api/v1/todos/[id]/route";
import { POST as reorderTodos } from "@/app/api/v1/todos/reorder/route";
import { POST as createTodo, GET as listTodos } from "@/app/api/v1/todos/route";
import { GET as listTodoTags } from "@/app/api/v1/todos/tags/route";

const readAuth = {
  auth: {
    userId: "user-1",
    keyId: "key-1",
    keyPrefix: "zhe_test1234",
    scopes: ["todos:read"] as const,
  },
  headers: {},
};
const writeAuth = {
  auth: {
    userId: "user-1",
    keyId: "key-2",
    keyPrefix: "zhe_test5678",
    scopes: ["todos:write"] as const,
  },
  headers: {},
};

const detailFixture = {
  id: 1,
  parentId: null,
  position: 0,
  title: "Root",
  done: false,
  hasContent: false,
  excerpt: null,
  tagNames: [],
  dueAt: null,
  emoji: null,
  content: null,
  doneAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("todos v1 API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("auth gates", () => {
    it.each([
      ["GET list", () => listTodos(new NextRequest("http://localhost/api/v1/todos")), "todos:read"],
      [
        "GET tags",
        () => listTodoTags(new NextRequest("http://localhost/api/v1/todos/tags")),
        "todos:read",
      ],
      [
        "GET by id",
        () => getTodo(new NextRequest("http://localhost/api/v1/todos/1"), ctx("1")),
        "todos:read",
      ],
      [
        "POST create",
        () =>
          createTodo(
            new NextRequest("http://localhost/api/v1/todos", {
              method: "POST",
              body: JSON.stringify({ title: "x" }),
            }),
          ),
        "todos:write",
      ],
      [
        "PATCH",
        () =>
          patchTodo(
            new NextRequest("http://localhost/api/v1/todos/1", {
              method: "PATCH",
              body: JSON.stringify({ title: "y" }),
            }),
            ctx("1"),
          ),
        "todos:write",
      ],
      [
        "DELETE",
        () =>
          deleteTodo(
            new NextRequest("http://localhost/api/v1/todos/1", { method: "DELETE" }),
            ctx("1"),
          ),
        "todos:write",
      ],
      [
        "POST move",
        () =>
          moveTodo(
            new NextRequest("http://localhost/api/v1/todos/1/move", {
              method: "POST",
              body: JSON.stringify({ parentId: null, position: 0 }),
            }),
            ctx("1"),
          ),
        "todos:write",
      ],
      [
        "POST reorder",
        () =>
          reorderTodos(
            new NextRequest("http://localhost/api/v1/todos/reorder", {
              method: "POST",
              body: JSON.stringify({ parentId: null, orderedIds: [1] }),
            }),
          ),
        "todos:write",
      ],
    ])("%s returns 401 when auth fails", async (_label, handler, scope) => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
      const response = await handler();
      expect(response.status).toBe(401);
      expect(mockRequireAuth).toHaveBeenCalledWith(expect.any(NextRequest), scope);
    });

    it.each([
      ["GET list", () => listTodos(new NextRequest("http://localhost/api/v1/todos")), "todos:read"],
      [
        "POST create",
        () =>
          createTodo(
            new NextRequest("http://localhost/api/v1/todos", {
              method: "POST",
              body: JSON.stringify({ title: "x" }),
            }),
          ),
        "todos:write",
      ],
    ])("%s returns 403 when scope is missing", async (_label, handler, scope) => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
      );
      const response = await handler();
      expect(response.status).toBe(403);
      expect(mockRequireAuth).toHaveBeenCalledWith(expect.any(NextRequest), scope);
    });
  });

  describe("GET /todos", () => {
    it("lists todos for authorized caller", async () => {
      mockRequireAuth.mockResolvedValue(readAuth);
      mockGetTodos.mockResolvedValue([detailFixture]);

      const response = await listTodos(new NextRequest("http://localhost/api/v1/todos"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.total).toBe(1);
    });
  });

  describe("GET /todos/[id]", () => {
    it("returns 400 for malformed id", async () => {
      mockRequireAuth.mockResolvedValue(readAuth);
      const response = await getTodo(
        new NextRequest("http://localhost/api/v1/todos/1foreign"),
        ctx("1foreign"),
      );
      expect(response.status).toBe(400);
      expect(mockGetTodoById).not.toHaveBeenCalled();
    });

    it("returns 404 when todo is not owned (missing)", async () => {
      mockRequireAuth.mockResolvedValue(readAuth);
      mockGetTodoById.mockResolvedValue(null);
      const response = await getTodo(new NextRequest("http://localhost/api/v1/todos/1"), ctx("1"));
      expect(response.status).toBe(404);
    });

    it("returns detail when found", async () => {
      mockRequireAuth.mockResolvedValue(readAuth);
      mockGetTodoById.mockResolvedValue(detailFixture);
      const response = await getTodo(new NextRequest("http://localhost/api/v1/todos/1"), ctx("1"));
      expect(response.status).toBe(200);
    });
  });

  describe("POST /todos", () => {
    it("creates with write scope", async () => {
      mockRequireAuth.mockResolvedValue(writeAuth);
      mockCreateTodo.mockResolvedValue(detailFixture);
      const response = await createTodo(
        new NextRequest("http://localhost/api/v1/todos", {
          method: "POST",
          body: JSON.stringify({ title: "New" }),
        }),
      );
      expect(response.status).toBe(201);
    });
  });

  describe("PATCH /todos/[id]", () => {
    it("returns 404 when not found", async () => {
      mockRequireAuth.mockResolvedValue(writeAuth);
      mockUpdateTodo.mockResolvedValue(null);
      const response = await patchTodo(
        new NextRequest("http://localhost/api/v1/todos/1", {
          method: "PATCH",
          body: JSON.stringify({ title: "x" }),
        }),
        ctx("1"),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /todos/[id]", () => {
    it("returns 400 for malformed id", async () => {
      mockRequireAuth.mockResolvedValue(writeAuth);
      const response = await deleteTodo(
        new NextRequest("http://localhost/api/v1/todos/1e3", { method: "DELETE" }),
        ctx("1e3"),
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 when not found", async () => {
      mockRequireAuth.mockResolvedValue(writeAuth);
      mockDeleteTodo.mockResolvedValue(false);
      const response = await deleteTodo(
        new NextRequest("http://localhost/api/v1/todos/9", { method: "DELETE" }),
        ctx("9"),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("POST /todos/[id]/move", () => {
    it("returns 400 for malformed path id", async () => {
      mockRequireAuth.mockResolvedValue(writeAuth);
      const response = await moveTodo(
        new NextRequest("http://localhost/api/v1/todos/1.5/move", {
          method: "POST",
          body: JSON.stringify({ parentId: null, position: 0 }),
        }),
        ctx("1.5"),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("POST /todos/reorder", () => {
    it("reorders with write scope", async () => {
      mockRequireAuth.mockResolvedValue(writeAuth);
      mockReorderSiblings.mockResolvedValue([2, 1]);
      const response = await reorderTodos(
        new NextRequest("http://localhost/api/v1/todos/reorder", {
          method: "POST",
          body: JSON.stringify({ parentId: null, orderedIds: [2, 1] }),
        }),
      );
      expect(response.status).toBe(200);
    });
  });

  describe("GET /todos/tags", () => {
    it("returns tag names", async () => {
      mockRequireAuth.mockResolvedValue(readAuth);
      mockGetTodoTags.mockResolvedValue(["work"]);
      const response = await listTodoTags(new NextRequest("http://localhost/api/v1/todos/tags"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tags).toEqual(["work"]);
    });
  });
});
