/**
 * POST /api/v1/todos/reorder - Reorder sibling todos under a parent
 *
 * Requires: todos:write
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiRequest } from "@/lib/api/audit";
import { apiError, requireAuthWithRateLimit } from "@/lib/api/auth";
import { isErrorResponse, parseJsonBody } from "@/lib/api/validation";
import { ScopedDB } from "@/lib/db/scoped";
import { buildReorderPayload, mapReorderTodoError } from "@/models/todo-wire";

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

  const built = buildReorderPayload(bodyResult.parentId, bodyResult.orderedIds);
  if ("error" in built) {
    return apiError(built.error, 400);
  }

  try {
    const db = new ScopedDB(userId);
    const orderedIds = await db.reorderSiblings(built.parentId, built.orderedIds);

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/todos/reorder",
      method: "POST",
      statusCode: 200,
    });

    return NextResponse.json({ orderedIds }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/todos/reorder POST]", error);
    const message = mapReorderTodoError(error);
    return apiError(message, message === "Failed to reorder siblings" ? 500 : 400);
  }
}
