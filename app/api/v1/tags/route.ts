/**
 * GET  /api/v1/tags - List all tags
 * POST /api/v1/tags - Create a new tag
 *
 * Requires: tags:read (GET), tags:write (POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { tagToResponse } from "@/lib/api/serializers";
import { ScopedDB } from "@/lib/db/scoped";

/**
 * GET /api/v1/tags
 *
 * Response: { tags: Tag[] }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "tags:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  try {
    const db = new ScopedDB(userId);
    const tags = await db.getTags();

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/tags",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ tags: tags.map(tagToResponse) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/tags GET]", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * POST /api/v1/tags
 *
 * Body:
 *   - name: string (required)
 *   - color: string (required, hex color)
 *
 * Response: { tag: Tag }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "tags:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  try {
    const db = new ScopedDB(userId);
    const body = await request.json();

    // Validate name
    if (!body.name || typeof body.name !== "string") {
      return apiError("name is required and must be a string", 400);
    }

    const trimmedName = body.name.trim();
    if (trimmedName.length === 0) {
      return apiError("name cannot be empty", 400);
    }
    if (trimmedName.length > 50) {
      return apiError("name must be at most 50 characters", 400);
    }

    // Validate color
    if (!body.color || typeof body.color !== "string") {
      return apiError("color is required and must be a string", 400);
    }

    // Validate hex color format (with or without #)
    const hexColorPattern = /^#?[0-9A-Fa-f]{6}$/;
    if (!hexColorPattern.test(body.color)) {
      return apiError("color must be a valid 6-digit hex color (e.g., '#ff5500' or 'ff5500')", 400);
    }

    // Normalize color to include #
    const normalizedColor = body.color.startsWith("#") ? body.color : `#${body.color}`;

    const tag = await db.createTag({
      name: trimmedName,
      color: normalizedColor,
    });

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/tags",
      method: "POST",
      statusCode: 201,
    });

    return NextResponse.json({ tag: tagToResponse(tag) }, { status: 201, headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/tags POST]", error);
    return apiError("Internal server error", 500);
  }
}
