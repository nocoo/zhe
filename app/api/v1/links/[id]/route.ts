/**
 * GET    /api/v1/links/[id] - Get a specific link
 * PATCH  /api/v1/links/[id] - Update a link
 * DELETE /api/v1/links/[id] - Delete a link
 *
 * Requires: links:read (GET), links:write (PATCH, DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import { slugExists } from "@/lib/db";
import { kvPutLink, kvDeleteLink } from "@/lib/kv/client";
import type { Link } from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/v1/links/[id]
 *
 * Response: { link: Link }
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuth(request, "links:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId, keyPrefix } = authResult;
  const { id } = await context.params;
  const linkId = parseInt(id, 10);

  if (isNaN(linkId)) {
    return apiError("Invalid link ID", 400);
  }

  try {
    const db = new ScopedDB(userId);
    const link = await db.getLinkById(linkId);

    if (!link) {
      return apiError("Link not found", 404);
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/links/${id}`,
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json({ link: linkToResponse(link) });
  } catch (error) {
    console.error(`[/api/v1/links/${id} GET]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/links/[id]
 *
 * Body (all optional):
 *   - originalUrl: New destination URL
 *   - slug: New slug (must be available)
 *   - folderId: New folder ID (or null to remove)
 *   - expiresAt: New expiration (ISO 8601, or null to remove)
 *   - note: New note (or null to remove)
 *
 * Response: { link: Link }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuth(request, "links:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId, keyPrefix } = authResult;
  const { id } = await context.params;
  const linkId = parseInt(id, 10);

  if (isNaN(linkId)) {
    return apiError("Invalid link ID", 400);
  }

  try {
    const db = new ScopedDB(userId);
    const body = await request.json();

    // Get existing link first
    const existingLink = await db.getLinkById(linkId);
    if (!existingLink) {
      return apiError("Link not found", 404);
    }

    // Build update data
    const updateData: Partial<Pick<Link, "originalUrl" | "slug" | "folderId" | "expiresAt" | "isCustom" | "screenshotUrl">> = {};

    // Validate and set originalUrl
    if (body.originalUrl !== undefined) {
      if (typeof body.originalUrl !== "string") {
        return apiError("originalUrl must be a string", 400);
      }
      try {
        new URL(body.originalUrl);
      } catch {
        return apiError("Invalid URL format", 400);
      }
      updateData.originalUrl = body.originalUrl;
    }

    // Validate and set slug
    if (body.slug !== undefined && body.slug !== existingLink.slug) {
      if (!/^[a-zA-Z0-9_-]+$/.test(body.slug)) {
        return apiError("Invalid slug format. Use only letters, numbers, hyphens, and underscores.", 400);
      }
      if (body.slug.length < 3 || body.slug.length > 50) {
        return apiError("Slug must be between 3 and 50 characters", 400);
      }
      const exists = await slugExists(body.slug);
      if (exists) {
        return apiError("Slug already in use", 409);
      }
      updateData.slug = body.slug;
      updateData.isCustom = true;
    }

    // Validate and set folderId
    if (body.folderId !== undefined) {
      if (body.folderId !== null) {
        const folder = await db.getFolderById(body.folderId);
        if (!folder) {
          return apiError("Folder not found", 404);
        }
      }
      updateData.folderId = body.folderId;
    }

    // Validate and set expiresAt
    if (body.expiresAt !== undefined) {
      if (body.expiresAt !== null) {
        const parsed = new Date(body.expiresAt);
        if (isNaN(parsed.getTime())) {
          return apiError("Invalid expiresAt format. Use ISO 8601.", 400);
        }
        if (parsed.getTime() <= Date.now()) {
          return apiError("Expiration date must be in the future", 400);
        }
        updateData.expiresAt = parsed;
      } else {
        updateData.expiresAt = null; // Remove expiration
      }
    }

    // Handle note update separately (not in Link update)
    if (body.note !== undefined) {
      await db.updateLinkNote(linkId, body.note);
    }

    // Perform the update
    let updatedLink: Link | null;
    if (Object.keys(updateData).length > 0) {
      updatedLink = await db.updateLink(linkId, updateData);
    } else {
      // If only note was updated, re-fetch the link
      updatedLink = await db.getLinkById(linkId);
    }

    if (!updatedLink) {
      return apiError("Link not found", 404);
    }

    // Update KV cache if slug or URL changed
    const oldSlug = existingLink.slug;
    const newSlug = updatedLink.slug;
    if (oldSlug !== newSlug) {
      // Delete old slug, add new one
      kvDeleteLink(oldSlug).catch(() => {});
      kvPutLink(newSlug, {
        id: updatedLink.id,
        originalUrl: updatedLink.originalUrl,
        expiresAt: updatedLink.expiresAt ? updatedLink.expiresAt.getTime() : null,
      }).catch(() => {});
    } else if (updateData.originalUrl || updateData.expiresAt !== undefined) {
      // URL or expiration changed, update KV
      kvPutLink(newSlug, {
        id: updatedLink.id,
        originalUrl: updatedLink.originalUrl,
        expiresAt: updatedLink.expiresAt ? updatedLink.expiresAt.getTime() : null,
      }).catch(() => {});
    }

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/links/${id}`,
      method: "PATCH",
      statusCode: 200,
    });

    return NextResponse.json({ link: linkToResponse(updatedLink) });
  } catch (error) {
    console.error(`[/api/v1/links/${id} PATCH]`, error);
    return apiError("Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/links/[id]
 *
 * Response: { success: true }
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuth(request, "links:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId, keyId, keyPrefix } = authResult;
  const { id } = await context.params;
  const linkId = parseInt(id, 10);

  if (isNaN(linkId)) {
    return apiError("Invalid link ID", 400);
  }

  try {
    const db = new ScopedDB(userId);

    // Get the link to know its slug for KV cleanup
    const link = await db.getLinkById(linkId);
    if (!link) {
      return apiError("Link not found", 404);
    }

    const deleted = await db.deleteLink(linkId);
    if (!deleted) {
      return apiError("Link not found", 404);
    }

    // Fire-and-forget KV cleanup
    kvDeleteLink(link.slug).catch(() => {});

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/links/${id}`,
      method: "DELETE",
      statusCode: 200,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[/api/v1/links/${id} DELETE]`, error);
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
