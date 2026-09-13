/**
 * GET    /api/v1/uploads/[id] - Get a specific upload
 * DELETE /api/v1/uploads/[id] - Delete an upload
 *
 * Requires: uploads:read (GET), uploads:write (DELETE)
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiRequest } from "@/lib/api/audit";
import { apiError, requireAuthWithRateLimit } from "@/lib/api/auth";
import { uploadToResponse } from "@/lib/api/serializers";
import { ScopedDB } from "@/lib/db/scoped";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/v1/uploads/[id]
 *
 * Response: { upload: Upload }
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "uploads:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const uploadId = parseInt(id, 10);

  if (Number.isNaN(uploadId)) {
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
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "uploads:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const uploadId = parseInt(id, 10);

  if (Number.isNaN(uploadId)) {
    return apiError("Invalid upload ID", 400);
  }

  try {
    const db = new ScopedDB(userId);

    // Shared deletion queues R2 objects and removes linked X attachments.
    const deleted = await db.deleteUpload(uploadId);
    if (!deleted) {
      return apiError("Upload not found", 404);
    }

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
