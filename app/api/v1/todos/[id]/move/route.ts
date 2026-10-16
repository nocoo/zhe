/**
 * POST /api/v1/todos/[id]/move - Reparent and reorder a todo
 *
 * Requires: todos:write
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiRequest } from "@/lib/api/audit";
import { apiError, requireAuthWithRateLimit } from "@/lib/api/auth";
import { isErrorResponse, parseJsonBody } from "@/lib/api/validation";
import { ScopedDB } from "@/lib/db/scoped";
import { buildMoveTodoInput, mapMoveTodoError, parseTodoIdParam } from "@/models/todo-wire";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
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

  const built = buildMoveTodoInput(bodyResult);
  if ("error" in built) {
    return apiError(built.error, 400);
  }

  try {
    const db = new ScopedDB(userId);
    const result = await db.moveTodo(todoId, built.input);

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/todos/${id}/move`,
      method: "POST",
      statusCode: 200,
    });

    return NextResponse.json({ move: result }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/todos/${id}/move POST]`, error);
    const message = mapMoveTodoError(error);
    const status =
      message === "Failed to move todo" ? 500 : message === "Todo not found" ? 404 : 400;
    return apiError(message, status);
  }
}
