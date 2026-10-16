/**
 * GET    /api/v1/todos/[id] - Get a specific todo
 * PATCH  /api/v1/todos/[id] - Update a todo
 * DELETE /api/v1/todos/[id] - Delete a todo
 *
 * Requires: todos:read (GET), todos:write (PATCH, DELETE)
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiRequest } from "@/lib/api/audit";
import { apiError, requireAuthWithRateLimit } from "@/lib/api/auth";
import { todoDetailToResponse } from "@/lib/api/serializers";
import { isErrorResponse, parseJsonBody } from "@/lib/api/validation";
import { ScopedDB } from "@/lib/db/scoped";
import { buildUpdateTodoPatch, mapUpdateTodoError, parseTodoIdParam } from "@/models/todo-wire";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "todos:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const todoId = parseTodoIdParam(id);

  if (todoId === null) {
    return apiError("Invalid todo ID", 400);
  }

  try {
    const db = new ScopedDB(userId);
    const todo = await db.getTodoById(todoId);

    if (!todo) {
      return apiError("Todo not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/todos/${id}`,
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ todo: todoDetailToResponse(todo) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/todos/${id} GET]`, error);
    return apiError("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "todos:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const todoId = parseTodoIdParam(id);

  if (todoId === null) {
    return apiError("Invalid todo ID", 400);
  }

  const bodyResult = await parseJsonBody(request);
  if (isErrorResponse(bodyResult)) {
    return bodyResult;
  }

  const built = buildUpdateTodoPatch(bodyResult);
  if ("error" in built) {
    return apiError(built.error, 400);
  }

  try {
    const db = new ScopedDB(userId);
    const todo = await db.updateTodo(todoId, built.patch);

    if (!todo) {
      return apiError("Todo not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/todos/${id}`,
      method: "PATCH",
      statusCode: 200,
    });

    return NextResponse.json({ todo: todoDetailToResponse(todo) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/todos/${id} PATCH]`, error);
    const message = mapUpdateTodoError(error);
    return apiError(message, message === "Failed to update todo" ? 500 : 400);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "todos:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const todoId = parseTodoIdParam(id);

  if (todoId === null) {
    return apiError("Invalid todo ID", 400);
  }

  try {
    const db = new ScopedDB(userId);
    const deleted = await db.deleteTodo(todoId);
    if (!deleted) {
      return apiError("Todo not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/todos/${id}`,
      method: "DELETE",
      statusCode: 200,
    });

    return NextResponse.json({ success: true }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/todos/${id} DELETE]`, error);
    return apiError("Internal server error", 500);
  }
}
