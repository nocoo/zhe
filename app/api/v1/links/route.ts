/**
 * GET  /api/v1/links - List all links for the authenticated user
 * POST /api/v1/links - Create a new link
 *
 * Requires: links:read (GET), links:write (POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { parsePaginationParams, parseJsonBody, isErrorResponse } from "@/lib/api/validation";
import { linkToResponse } from "@/lib/api/serializers";
import { ScopedDB, type LinkSortField, type SortOrder } from "@/lib/db/scoped";
import { slugExists } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/slug";
import { kvPutLink } from "@/lib/kv/client";

/**
 * GET /api/v1/links
 *
 * Query params:
 *   - q (optional): Keyword search across slug, URL, note, title, description
 *   - folderId (optional): Filter by folder. Use "null" for inbox (no folder)
 *   - tagId (optional): Filter by tag ID
 *   - sort (optional): Sort field - "created" (default) or "clicks"
 *   - order (optional): Sort order - "desc" (default) or "asc"
 *   - limit (optional): Max results (default 100, max 500)
 *   - offset (optional): Pagination offset
 *
 * Response: { links: Link[], total: number }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "links:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  try {
    const db = new ScopedDB(userId);
    const url = new URL(request.url);

    // Build filter options - only include defined values
    const queryParam = url.searchParams.get("q");
    const folderIdParam = url.searchParams.get("folderId");
    const tagIdParam = url.searchParams.get("tagId");
    const sortParam = url.searchParams.get("sort");
    const orderParam = url.searchParams.get("order");

    // Special handling: folderId=null means inbox (links with no folder)
    const options: {
      query?: string;
      folderId?: string | 'inbox';
      tagId?: string;
      sortBy?: LinkSortField;
      sortOrder?: SortOrder;
    } = {};
    if (queryParam) options.query = queryParam;
    if (folderIdParam === "null") {
      options.folderId = "inbox";
    } else if (folderIdParam) {
      options.folderId = folderIdParam;
    }
    if (tagIdParam) options.tagId = tagIdParam;

    // Validate and apply sort options
    if (sortParam) {
      if (sortParam !== 'created' && sortParam !== 'clicks') {
        return apiError("Invalid sort value. Use 'created' or 'clicks'.", 400);
      }
      options.sortBy = sortParam;
    }
    if (orderParam) {
      if (orderParam !== 'asc' && orderParam !== 'desc') {
        return apiError("Invalid order value. Use 'asc' or 'desc'.", 400);
      }
      options.sortOrder = orderParam;
    }

    // Validate pagination BEFORE hitting DB
    const paginationResult = parsePaginationParams(url);
    if (isErrorResponse(paginationResult)) {
      return paginationResult;
    }
    const { limit, offset } = paginationResult;

    const { items: links, total } = await db.getLinksPage({ ...options, limit, offset });
    const tagsMap = await db.getTagsForLinks(links.map((l) => l.id));

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/links",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json(
      { links: links.map((l) => linkToResponse(l, tagsMap.get(l.id) ?? [])), total },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("[/api/v1/links GET]", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * POST /api/v1/links
 *
 * Body:
 *   - url (required): The URL to shorten
 *   - slug (optional): Custom slug (auto-generated if not provided)
 *   - folderId (optional): Folder to place the link in
 *   - expiresAt (optional): ISO 8601 expiration date
 *   - note (optional): User note
 *
 * Response: { link: Link }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "links:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  const bodyResult = await parseJsonBody(request);
  if (isErrorResponse(bodyResult)) {
    return bodyResult;
  }
  const bodyObj = bodyResult;

  try {
    // Validate required fields
    if (!bodyObj.url || typeof bodyObj.url !== "string") {
      return apiError("Missing or invalid 'url' field", 400);
    }

    // Validate URL format
    try {
      new URL(bodyObj.url);
    } catch {
      return apiError("Invalid URL format", 400);
    }

    const db = new ScopedDB(userId);

    // Generate or validate slug
    let slug: string;
    const isCustom = !!bodyObj.slug;

    if (bodyObj.slug !== undefined) {
      if (typeof bodyObj.slug !== "string") {
        return apiError("'slug' must be a string", 400);
      }
      // Validate custom slug format
      if (!/^[a-zA-Z0-9_-]+$/.test(bodyObj.slug)) {
        return apiError("Invalid slug format. Use only letters, numbers, hyphens, and underscores.", 400);
      }
      if (bodyObj.slug.length < 3 || bodyObj.slug.length > 50) {
        return apiError("Slug must be between 3 and 50 characters", 400);
      }

      // Check availability
      const exists = await slugExists(bodyObj.slug);
      if (exists) {
        return apiError("Slug already in use", 409);
      }
      slug = bodyObj.slug;
    } else {
      slug = await generateUniqueSlug(slugExists);
    }

    // Validate folder if specified
    if (bodyObj.folderId !== undefined) {
      if (typeof bodyObj.folderId !== "string") {
        return apiError("'folderId' must be a string", 400);
      }
      const folder = await db.getFolderById(bodyObj.folderId);
      if (!folder) {
        return apiError("Folder not found", 404);
      }
    }

    // Parse expiration
    let expiresAt: Date | undefined;
    if (bodyObj.expiresAt !== undefined) {
      if (typeof bodyObj.expiresAt !== "string") {
        return apiError("'expiresAt' must be a string (ISO 8601 format)", 400);
      }
      const parsed = new Date(bodyObj.expiresAt);
      if (isNaN(parsed.getTime())) {
        return apiError("Invalid expiresAt format. Use ISO 8601.", 400);
      }
      if (parsed.getTime() <= Date.now()) {
        return apiError("Expiration date must be in the future", 400);
      }
      expiresAt = parsed;
    }

    // Validate note if provided
    if (bodyObj.note !== undefined && bodyObj.note !== null && typeof bodyObj.note !== "string") {
      return apiError("'note' must be a string or null", 400);
    }

    // Create the link
    const link = await db.createLink({
      originalUrl: bodyObj.url,
      slug,
      isCustom,
      folderId: typeof bodyObj.folderId === "string" ? bodyObj.folderId : null,
      expiresAt,
      note: typeof bodyObj.note === "string" ? bodyObj.note : null,
      screenshotUrl: null,
    });

    // Fire-and-forget KV cache update
    kvPutLink(link.slug, {
      id: link.id,
      originalUrl: link.originalUrl,
      expiresAt: link.expiresAt ? link.expiresAt.getTime() : null,
    }).catch(() => {
      // Silently ignore KV errors
    });

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/links",
      method: "POST",
      statusCode: 201,
    });

    return NextResponse.json({ link: linkToResponse(link) }, { status: 201, headers: rateLimitHeaders });
  } catch (error) {
    console.error("[/api/v1/links POST]", error);
    return apiError("Internal server error", 500);
  }
}
