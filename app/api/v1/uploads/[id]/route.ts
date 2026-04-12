/**
 * GET    /api/v1/uploads/[id] - Get a specific upload
 * DELETE /api/v1/uploads/[id] - Delete an upload
 *
 * Requires: uploads:read (GET), uploads:write (DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import { deleteR2Object } from "@/lib/r2/client";
import type { Upload } from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/v1/uploads/[id]
 *
 * Response: { upload: Upload }
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "uploads:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const uploadId = parseInt(id, 10);

  if (isNaN(uploadId)) {
    return apiError("Invalid upload ID", 400);
  }

  try {
    const db = new ScopedDB(userId);
    const upload = await db.getUploadById(uploadId);

    if (!upload) {
      return apiError("Upload not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/uploads/${id}`,
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ upload: uploadToResponse(upload) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/uploads/${id} GET]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/uploads/[id]
 *
 * Response: { success: true }
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "uploads:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const uploadId = parseInt(id, 10);

  if (isNaN(uploadId)) {
    return apiError("Invalid upload ID", 400);
  }

  try {
    const db = new ScopedDB(userId);

    // Get the upload first to know the R2 key
    const upload = await db.getUploadById(uploadId);
    if (!upload) {
      return apiError("Upload not found", 404);
    }

    // Delete from D1
    const deleted = await db.deleteUpload(uploadId);
    if (!deleted) {
      return apiError("Upload not found", 404);
    }

    // Delete from R2 (fire-and-forget)
    deleteR2Object(upload.key).catch((error) => {
      console.error(`[/api/v1/uploads/${id} DELETE] R2 cleanup failed:`, error);
    });

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/uploads/${id}`,
      method: "DELETE",
      statusCode: 200,
    });

    return NextResponse.json({ success: true }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error(`[/api/v1/uploads/${id} DELETE]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * Transform an Upload to API response format.
 * Converts Date objects to ISO strings.
 */
function uploadToResponse(upload: Upload): Record<string, unknown> {
  return {
    id: upload.id,
    key: upload.key,
    fileName: upload.fileName,
    fileType: upload.fileType,
    fileSize: upload.fileSize,
    publicUrl: upload.publicUrl,
    createdAt: upload.createdAt.toISOString(),
  };
}
