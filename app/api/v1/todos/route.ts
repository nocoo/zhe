/**
 * GET  /api/v1/todos - List all todos (flat tree nodes)
 * POST /api/v1/todos - Create a new todo
 *
 * Requires: todos:read (GET), todos:write (POST)
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiRequest } from "@/lib/api/audit";
import { apiError, requireAuthWithRateLimit } from "@/lib/api/auth";
import { todoDetailToResponse, todoTreeNodeToResponse } from "@/lib/api/serializers";
import { isErrorResponse, parseJsonBody } from "@/lib/api/validation";
import { ScopedDB } from "@/lib/db/scoped";
import { buildCreateTodoInput, mapCreateTodoError } from "@/models/todo-wire";

/**
 * GET /api/v1/todos
 *
 * Response: { todos: TodoTreeNode[], total: number }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "todos:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  try {
    const db = new ScopedDB(userId);
    const todos = await db.getTodos();

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/todos",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json(
      { todos: todos.map(todoTreeNodeToResponse), total: todos.length },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("[/api/v1/todos GET]", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * POST /api/v1/todos
 *
 * Body:
 *   - title (required)
 *   - parentId, content, dueAtMs, tagNames, emoji (optional)
 *
 * Response: { todo: TodoDetail }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "todos:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  const bodyResult = await parseJsonBody(request);
  if (isErrorResponse(bodyResult)) {
    return bodyResult;
  }

  const built = buildCreateTodoInput(bodyResult);
  if ("error" in built) {
    return apiError(built.error, 400);
  }

  try {
    const db = new ScopedDB(userId);
    const todo = await db.createTodo(built.input);

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/todos",
      method: "POST",
      statusCode: 201,
    });

    return NextResponse.json(
      { todo: todoDetailToResponse(todo) },
      { status: 201, headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("[/api/v1/todos POST]", error);
    const message = mapCreateTodoError(error);
    const status = message === "Failed to create todo" ? 500 : 400;
    return apiError(message, status);
  }
}
