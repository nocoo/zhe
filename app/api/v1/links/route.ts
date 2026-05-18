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
import {
  validateUrl,
  resolveSlug,
  validateFolderId,
  parseExpiresAt,
  validateNote,
} from "./post-validators";
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
  if (authResult instanceof NextResponse) return authResult;

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  const bodyResult = await parseJsonBody(request);
  if (isErrorResponse(bodyResult)) return bodyResult;
  const bodyObj = bodyResult;

  try {
    const urlResult = validateUrl(bodyObj.url);
    if (urlResult instanceof NextResponse) return urlResult;

    const db = new ScopedDB(userId);

    const slugResult = await resolveSlug(bodyObj.slug);
    if (slugResult instanceof NextResponse) return slugResult;

    const folderError = await validateFolderId(db, bodyObj.folderId);
    if (folderError) return folderError;

    const expiresResult = parseExpiresAt(bodyObj.expiresAt);
    if (expiresResult instanceof NextResponse) return expiresResult;

    const noteError = validateNote(bodyObj.note);
    if (noteError) return noteError;

    const link = await db.createLink({
      originalUrl: urlResult,
      slug: slugResult.slug,
      isCustom: slugResult.isCustom,
      folderId: typeof bodyObj.folderId === "string" ? bodyObj.folderId : null,
      ...(expiresResult ? { expiresAt: expiresResult } : {}),
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

    return NextResponse.json(
      { link: linkToResponse(link) },
      { status: 201, headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("[/api/v1/links POST]", error);
    return apiError("Internal server error", 500);
  }
}
