// @vitest-environment node

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAuth = vi.fn();
const mockGetTodos = vi.fn();
const mockGetTodoById = vi.fn();
const mockCreateTodo = vi.fn();
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
      getTodoTags: mockGetTodoTags,
    };
  }),
}));

import { GET as listTodos } from "@/app/api/v1/todos/route";
import { GET as listTodoTags } from "@/app/api/v1/todos/tags/route";

const authOk = {
  auth: {
    userId: "user-1",
    keyId: "key-1",
    keyPrefix: "zhe_test1234",
    scopes: ["todos:read"] as const,
  },
  headers: {},
};

describe("todos v1 API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /todos returns 401 when auth fails", async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await listTodos(new NextRequest("http://localhost/api/v1/todos"));
    expect(response.status).toBe(401);
  });

  it("GET /todos returns 403 when scope is missing", async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    );
    const response = await listTodos(new NextRequest("http://localhost/api/v1/todos"));
    expect(response.status).toBe(403);
  });

  it("GET /todos lists todos for authorized caller", async () => {
    mockRequireAuth.mockResolvedValue(authOk);
    mockGetTodos.mockResolvedValue([
      {
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
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const response = await listTodos(new NextRequest("http://localhost/api/v1/todos"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.todos[0].title).toBe("Root");
    expect(mockRequireAuth).toHaveBeenCalledWith(expect.any(NextRequest), "todos:read");
  });

  it("GET /todos/tags uses todos:read scope", async () => {
    mockRequireAuth.mockResolvedValue(authOk);
    mockGetTodoTags.mockResolvedValue(["work", "home"]);

    const response = await listTodoTags(new NextRequest("http://localhost/api/v1/todos/tags"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tags).toEqual(["work", "home"]);
    expect(mockRequireAuth).toHaveBeenCalledWith(expect.any(NextRequest), "todos:read");
  });
});
