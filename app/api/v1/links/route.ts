/**
 * GET  /api/v1/links - List all links for the authenticated user
 * POST /api/v1/links - Create a new link
 *
 * Requires: links:read (GET), links:write (POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB, type LinkSortField, type SortOrder } from "@/lib/db/scoped";
import { slugExists } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/slug";
import { kvPutLink } from "@/lib/kv/client";
import type { Link } from "@/lib/db/schema";

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

    // Parse pagination parameters
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    // Count total matching links (for pagination metadata)
    const total = await db.countLinks(options);

    // Fetch paginated links from DB
    const links = await db.getLinks({ ...options, limit, offset });

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/links",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ links: links.map(linkToResponse), total }, { headers: rateLimitHeaders });
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

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.url || typeof body.url !== "string") {
      return apiError("Missing or invalid 'url' field", 400);
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return apiError("Invalid URL format", 400);
    }

    const db = new ScopedDB(userId);

    // Generate or validate slug
    let slug: string;
    const isCustom = !!body.slug;

    if (body.slug) {
      // Validate custom slug format
      if (!/^[a-zA-Z0-9_-]+$/.test(body.slug)) {
        return apiError("Invalid slug format. Use only letters, numbers, hyphens, and underscores.", 400);
      }
      if (body.slug.length < 3 || body.slug.length > 50) {
        return apiError("Slug must be between 3 and 50 characters", 400);
      }

      // Check availability
      const exists = await slugExists(body.slug);
      if (exists) {
        return apiError("Slug already in use", 409);
      }
      slug = body.slug;
    } else {
      slug = await generateUniqueSlug(slugExists);
    }

    // Validate folder if specified
    if (body.folderId) {
      const folder = await db.getFolderById(body.folderId);
      if (!folder) {
        return apiError("Folder not found", 404);
      }
    }

    // Parse expiration
    let expiresAt: Date | undefined;
    if (body.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (isNaN(parsed.getTime())) {
        return apiError("Invalid expiresAt format. Use ISO 8601.", 400);
      }
      if (parsed.getTime() <= Date.now()) {
        return apiError("Expiration date must be in the future", 400);
      }
      expiresAt = parsed;
    }

    // Create the link
    const link = await db.createLink({
      originalUrl: body.url,
      slug,
      isCustom,
      folderId: body.folderId ?? null,
      expiresAt,
      note: body.note ?? null,
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

/**
 * Transform a Link to API response format.
 * Converts Date objects to ISO strings.
 */
function linkToResponse(link: Link): Record<string, unknown> {
  return {
    id: link.id,
    slug: link.slug,
    originalUrl: link.originalUrl,
    shortUrl: `https://zhe.to/${link.slug}`,
    folderId: link.folderId,
    isCustom: link.isCustom,
    clicks: link.clicks,
    note: link.note,
    metaTitle: link.metaTitle,
    metaDescription: link.metaDescription,
    screenshotUrl: link.screenshotUrl,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}
