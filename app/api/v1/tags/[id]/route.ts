/**
 * GET    /api/v1/tags/[id] - Get a specific tag
 * PATCH  /api/v1/tags/[id] - Update a tag
 * DELETE /api/v1/tags/[id] - Delete a tag
 *
 * Requires: tags:read (GET), tags:write (PATCH, DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import type { Tag } from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/v1/tags/[id]
 *
 * Response: { tag: Tag }
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuth(request, "tags:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId, keyPrefix } = authResult;
  const { id } = await context.params;

  try {
    const db = new ScopedDB(userId);
    const tag = await db.getTagById(id);

    if (!tag) {
      return apiError("Tag not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/tags/${id}`,
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ tag: tagToResponse(tag) });
  } catch (error) {
    console.error(`[/api/v1/tags/${id} GET]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/tags/[id]
 *
 * Body (all optional):
 *   - name: New tag name
 *   - color: New color (hex)
 *
 * Response: { tag: Tag }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuth(request, "tags:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId, keyPrefix } = authResult;
  const { id } = await context.params;

  try {
    const db = new ScopedDB(userId);
    const body = await request.json();

    // Check tag exists
    const existingTag = await db.getTagById(id);
    if (!existingTag) {
      return apiError("Tag not found", 404);
    }

    // Build update data
    const updateData: Partial<Pick<Tag, "name" | "color">> = {};

    // Validate and set name
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return apiError("name must be a string", 400);
      }
      const trimmedName = body.name.trim();
      if (trimmedName.length === 0) {
        return apiError("name cannot be empty", 400);
      }
      if (trimmedName.length > 50) {
        return apiError("name must be at most 50 characters", 400);
      }
      updateData.name = trimmedName;
    }

    // Validate and set color
    if (body.color !== undefined) {
      if (typeof body.color !== "string") {
        return apiError("color must be a string", 400);
      }
      const hexColorPattern = /^#?[0-9A-Fa-f]{6}$/;
      if (!hexColorPattern.test(body.color)) {
        return apiError("color must be a valid 6-digit hex color", 400);
      }
      updateData.color = body.color.startsWith("#") ? body.color : `#${body.color}`;
    }

    // Perform update
    let updatedTag: Tag | null;
    if (Object.keys(updateData).length > 0) {
      updatedTag = await db.updateTag(id, updateData);
    } else {
      updatedTag = existingTag;
    }

    if (!updatedTag) {
      return apiError("Tag not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/tags/${id}`,
      method: "PATCH",
      statusCode: 200,
    });

    return NextResponse.json({ tag: tagToResponse(updatedTag) });
  } catch (error) {
    console.error(`[/api/v1/tags/${id} PATCH]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/tags/[id]
 *
 * Response: { success: true }
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuth(request, "tags:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId, keyPrefix } = authResult;
  const { id } = await context.params;

  try {
    const db = new ScopedDB(userId);

    const deleted = await db.deleteTag(id);
    if (!deleted) {
      return apiError("Tag not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/tags/${id}`,
      method: "DELETE",
      statusCode: 200,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[/api/v1/tags/${id} DELETE]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * Transform a Tag to API response format.
 * Converts Date objects to ISO strings.
 */
function tagToResponse(tag: Tag): Record<string, unknown> {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
  };
}
