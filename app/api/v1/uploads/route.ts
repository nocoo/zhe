/**
 * GET  /api/v1/uploads - List all uploads
 *
 * Requires: uploads:read
 *
 * Note: POST (create) is handled via the existing /api/tmp/upload/[token]
 * or presigned URL flow. The CLI should use the dashboard upload flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { uploadToResponse } from "@/lib/api/serializers";
import { ScopedDB } from "@/lib/db/scoped";

/**
 * GET /api/v1/uploads
 *
 * Response: { uploads: Upload[] }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "uploads:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

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

    return NextResponse.json({ uploads: uploads.map(uploadToResponse) }, { headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/uploads GET]", error);
    return apiError("Internal server error", 500);
  }
}
