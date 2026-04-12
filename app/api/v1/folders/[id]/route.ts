/**
 * GET    /api/v1/folders/[id] - Get a specific folder
 * PATCH  /api/v1/folders/[id] - Update a folder
 * DELETE /api/v1/folders/[id] - Delete a folder
 *
 * Requires: folders:read (GET), folders:write (PATCH, DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import type { Folder } from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/v1/folders/[id]
 *
 * Response: { folder: Folder }
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "folders:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;

  try {
    const db = new ScopedDB(userId);
    const folder = await db.getFolderById(id);

    if (!folder) {
      return apiError("Folder not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/folders/${id}`,
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ folder: folderToResponse(folder) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/folders/${id} GET]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/folders/[id]
 *
 * Body (all optional):
 *   - name: New folder name
 *   - icon: New icon
 *
 * Response: { folder: Folder }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "folders:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;

  try {
    const db = new ScopedDB(userId);
    const body = await request.json();

    // Check folder exists
    const existingFolder = await db.getFolderById(id);
    if (!existingFolder) {
      return apiError("Folder not found", 404);
    }

    // Build update data
    const updateData: Partial<Pick<Folder, "name" | "icon">> = {};

    // Validate and set name
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return apiError("name must be a string", 400);
      }
      const trimmedName = body.name.trim();
      if (trimmedName.length === 0) {
        return apiError("name cannot be empty", 400);
      }
      if (trimmedName.length > 100) {
        return apiError("name must be at most 100 characters", 400);
      }
      updateData.name = trimmedName;
    }

    // Validate and set icon
    if (body.icon !== undefined) {
      if (typeof body.icon !== "string") {
        return apiError("icon must be a string", 400);
      }
      updateData.icon = body.icon;
    }

    // Perform update
    let updatedFolder: Folder | null;
    if (Object.keys(updateData).length > 0) {
      updatedFolder = await db.updateFolder(id, updateData);
    } else {
      updatedFolder = existingFolder;
    }

    if (!updatedFolder) {
      return apiError("Folder not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/folders/${id}`,
      method: "PATCH",
      statusCode: 200,
    });

    return NextResponse.json({ folder: folderToResponse(updatedFolder) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/folders/${id} PATCH]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/folders/[id]
 *
 * Response: { success: true }
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "folders:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;

  try {
    const db = new ScopedDB(userId);

    const deleted = await db.deleteFolder(id);
    if (!deleted) {
      return apiError("Folder not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/folders/${id}`,
      method: "DELETE",
      statusCode: 200,
    });

    return NextResponse.json({ success: true }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/folders/${id} DELETE]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * Transform a Folder to API response format.
 * Converts Date objects to ISO strings.
 */
function folderToResponse(folder: Folder): Record<string, unknown> {
  return {
    id: folder.id,
    name: folder.name,
    icon: folder.icon,
    createdAt: folder.createdAt.toISOString(),
  };
}
