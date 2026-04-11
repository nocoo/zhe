/**
 * GET  /api/v1/links - List all links for the authenticated user
 * POST /api/v1/links - Create a new link
 *
 * Requires: links:read (GET), links:write (POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import { slugExists } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/slug";
import { kvPutLink } from "@/lib/kv/client";
import type { Link } from "@/lib/db/schema";

/**
 * GET /api/v1/links
 *
 * Query params:
 *   - folderId (optional): Filter by folder
 *   - limit (optional): Max results (default 100, max 500)
 *   - offset (optional): Pagination offset
 *
 * Response: { links: Link[] }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request, "links:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId } = authResult;

  try {
    const db = new ScopedDB(userId);
    let links = await db.getLinks();

    // Filter by folder if specified
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    if (folderId) {
      links = links.filter((link) => link.folderId === folderId);
    }

    // Apply pagination
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    links = links.slice(offset, offset + limit);

    logApiRequest({
      keyId,
      keyPrefix: authResult.keyPrefix,
      userId,
      endpoint: "/api/v1/links",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ links: links.map(linkToResponse) });
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
  const authResult = await requireAuth(request, "links:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId } = authResult;

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
      keyPrefix: authResult.keyPrefix,
      userId,
      endpoint: "/api/v1/links",
      method: "POST",
      statusCode: 201,
    });

    return NextResponse.json({ link: linkToResponse(link) }, { status: 201 });
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
    screenshotUrl: link.screenshotUrl,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}
