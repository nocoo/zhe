/**
 * GET    /api/v1/ideas/[id] - Get a specific idea
 * PATCH  /api/v1/ideas/[id] - Update an idea
 * DELETE /api/v1/ideas/[id] - Delete an idea
 *
 * Requires: ideas:read (GET), ideas:write (PATCH, DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ideaDetailToResponse } from "@/lib/api/serializers";
import { ScopedDB } from "@/lib/db/scoped";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/v1/ideas/[id]
 *
 * Response: { idea: IdeaDetail }
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "ideas:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return apiError("Invalid idea ID", 400);
  }

  try {
    const db = new ScopedDB(userId);
    const idea = await db.getIdeaById(ideaId);

    if (!idea) {
      return apiError("Idea not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/ideas/${id}`,
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json(
      { idea: ideaDetailToResponse(idea) },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error(`[/api/v1/ideas/${id} GET]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/ideas/[id]
 *
 * Body (all optional):
 *   - title: New title (or null to remove)
 *   - content: New markdown content
 *   - tagIds: Array of tag IDs (replaces all existing tags)
 *
 * Response: { idea: IdeaDetail }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "ideas:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return apiError("Invalid idea ID", 400);
  }

  try {
    const db = new ScopedDB(userId);
    const body = await request.json();

    // Check if idea exists
    const existing = await db.getIdeaById(ideaId);
    if (!existing) {
      return apiError("Idea not found", 404);
    }

    // Build update data
    const updateData: {
      title?: string | null;
      content?: string;
      tagIds?: string[];
    } = {};

    // Validate title if provided
    if (body.title !== undefined) {
      if (body.title !== null && typeof body.title !== "string") {
        return apiError("'title' must be a string or null", 400);
      }
      updateData.title = body.title;
    }

    // Validate content if provided
    if (body.content !== undefined) {
      if (typeof body.content !== "string") {
        return apiError("'content' must be a string", 400);
      }
      const content = body.content.trim();
      if (!content) {
        return apiError("Content cannot be empty", 400);
      }
      updateData.content = content;
    }

    // Validate tagIds if provided
    if (body.tagIds !== undefined) {
      if (body.tagIds !== null) {
        if (!Array.isArray(body.tagIds)) {
          return apiError("'tagIds' must be an array or null", 400);
        }
        if (!body.tagIds.every((tid: unknown) => typeof tid === "string")) {
          return apiError("All tag IDs must be strings", 400);
        }
        updateData.tagIds = body.tagIds;
      } else {
        // null means remove all tags
        updateData.tagIds = [];
      }
    }

    // Update the idea
    const idea = await db.updateIdea(ideaId, updateData);

    if (!idea) {
      return apiError("Idea not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/ideas/${id}`,
      method: "PATCH",
      statusCode: 200,
    });

    return NextResponse.json(
      { idea: ideaDetailToResponse(idea) },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error(`[/api/v1/ideas/${id} PATCH]`, error);
    // Check for invalid tag IDs error
    if (error instanceof Error && error.message.includes("Invalid tag IDs")) {
      return apiError(error.message, 400);
    }
    return apiError("Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/ideas/[id]
 *
 * Response: { success: true }
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "ideas:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return apiError("Invalid idea ID", 400);
  }

  try {
    const db = new ScopedDB(userId);

    const deleted = await db.deleteIdea(ideaId);
    if (!deleted) {
      return apiError("Idea not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/ideas/${id}`,
      method: "DELETE",
      statusCode: 200,
    });

    return NextResponse.json({ success: true }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/ideas/${id} DELETE]`, error);
    return apiError("Internal server error", 500);
  }
}

