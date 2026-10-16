/**
 * GET /api/v1/todos/tags - Distinct free-form tag names on the user's todos
 *
 * Requires: todos:read
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiRequest } from "@/lib/api/audit";
import { apiError, requireAuthWithRateLimit } from "@/lib/api/auth";
import { ScopedDB } from "@/lib/db/scoped";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "todos:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  try {
    const db = new ScopedDB(userId);
    const tags = await db.getTodoTags();

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/todos/tags",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ tags }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/todos/tags GET]", error);
    return apiError("Internal server error", 500);
  }
}
