/**
 * GET  /api/v1/uploads - List all uploads
 *
 * Requires: uploads:read
 *
 * Note: POST (create) is handled via the existing /api/tmp/upload/[token]
 * or presigned URL flow. The CLI should use the dashboard upload flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import type { Upload } from "@/lib/db/schema";

/**
 * GET /api/v1/uploads
 *
 * Response: { uploads: Upload[] }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request, "uploads:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId, keyPrefix } = authResult;

  try {
    const db = new ScopedDB(userId);
    const uploads = await db.getUploads();

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/uploads",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ uploads: uploads.map(uploadToResponse) });
  } catch (error) {
    console.error("[/api/v1/uploads GET]", error);
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
