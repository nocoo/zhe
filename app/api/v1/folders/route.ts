/**
 * GET  /api/v1/folders - List all folders
 * POST /api/v1/folders - Create a new folder
 *
 * Requires: folders:read (GET), folders:write (POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import type { Folder } from "@/lib/db/schema";

/**
 * GET /api/v1/folders
 *
 * Response: { folders: Folder[] }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "folders:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  try {
    const db = new ScopedDB(userId);
    const folders = await db.getFolders();

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/folders",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ folders: folders.map(folderToResponse) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/folders GET]", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * POST /api/v1/folders
 *
 * Body:
 *   - name: string (required)
 *   - icon: string (optional, defaults to "folder")
 *
 * Response: { folder: Folder }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "folders:write");
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
    if (trimmedName.length > 100) {
      return apiError("name must be at most 100 characters", 400);
    }

    // Validate icon if provided
    if (body.icon !== undefined && typeof body.icon !== "string") {
      return apiError("icon must be a string", 400);
    }

    const folder = await db.createFolder({
      name: trimmedName,
      icon: body.icon ?? "folder",
    });

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/folders",
      method: "POST",
      statusCode: 201,
    });

    return NextResponse.json({ folder: folderToResponse(folder) }, { status: 201, headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/folders POST]", error);
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
