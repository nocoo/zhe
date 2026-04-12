/**
 * GET    /api/v1/links/[id] - Get a specific link
 * PATCH  /api/v1/links/[id] - Update a link
 * DELETE /api/v1/links/[id] - Delete a link
 *
 * Requires: links:read (GET), links:write (PATCH, DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { ScopedDB } from "@/lib/db/scoped";
import { executeD1Batch, type D1Statement } from "@/lib/db/d1-client";
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
  const authResult = await requireAuthWithRateLimit(request, "links:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
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

    return NextResponse.json({ link: linkToResponse(link) }, { headers: rateLimitHeaders });
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
 *   - metaTitle: Meta title (or null to remove)
 *   - metaDescription: Meta description (or null to remove)
 *   - screenshotUrl: Screenshot URL (or null to remove)
 *   - addTags: Array of tag IDs to add
 *   - removeTags: Array of tag IDs to remove
 *
 * Response: { link: Link }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "links:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
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

    // Validate and set screenshotUrl
    if (body.screenshotUrl !== undefined) {
      if (body.screenshotUrl !== null) {
        if (typeof body.screenshotUrl !== "string") {
          return apiError("screenshotUrl must be a string or null", 400);
        }
        // Validate URL format
        try {
          new URL(body.screenshotUrl);
        } catch {
          return apiError("Invalid screenshotUrl format", 400);
        }
      }
      updateData.screenshotUrl = body.screenshotUrl;
    }

    // === VALIDATION PHASE ===
    // Validate all tag operations BEFORE any writes to ensure atomicity

    const tagsToAdd: string[] = [];
    const tagsToRemove: string[] = [];

    if (body.addTags && Array.isArray(body.addTags)) {
      for (const tagId of body.addTags) {
        if (typeof tagId === "string") {
          // Verify tag exists and is owned by this user
          const tag = await db.getTagById(tagId);
          if (!tag) {
            return apiError(`Tag not found: ${tagId}`, 400);
          }
          tagsToAdd.push(tagId);
        }
      }
    }

    if (body.removeTags && Array.isArray(body.removeTags)) {
      // Get current tags associated with this link to validate removeTags
      const currentLinkTags = await db.getTagsForLink(linkId);
      const currentTagIds = new Set(currentLinkTags.map(t => t.id));

      for (const tagId of body.removeTags) {
        if (typeof tagId === "string") {
          // Verify tag is currently associated with this link
          if (!currentTagIds.has(tagId)) {
            return apiError(`Tag not associated with this link: ${tagId}`, 400);
          }
          tagsToRemove.push(tagId);
        }
      }
    }

    // === WRITE PHASE ===
    // All validations passed. Execute all writes in a single atomic batch.

    const statements: D1Statement[] = [];

    // 1. Note update
    if (body.note !== undefined) {
      statements.push({
        sql: 'UPDATE links SET note = ? WHERE id = ? AND user_id = ?',
        params: [body.note, linkId, userId],
      });
    }

    // 2. Metadata updates
    if (body.metaTitle !== undefined || body.metaDescription !== undefined) {
      const metaClauses: string[] = [];
      const metaParams: unknown[] = [];
      if (body.metaTitle !== undefined) {
        metaClauses.push('meta_title = ?');
        metaParams.push(body.metaTitle);
      }
      if (body.metaDescription !== undefined) {
        metaClauses.push('meta_description = ?');
        metaParams.push(body.metaDescription);
      }
      metaParams.push(linkId, userId);
      statements.push({
        sql: `UPDATE links SET ${metaClauses.join(', ')} WHERE id = ? AND user_id = ?`,
        params: metaParams,
      });
    }

    // 3. Add tags
    for (const tagId of tagsToAdd) {
      statements.push({
        sql: 'INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)',
        params: [linkId, tagId],
      });
    }

    // 4. Remove tags
    for (const tagId of tagsToRemove) {
      statements.push({
        sql: `DELETE FROM link_tags WHERE link_id = ? AND tag_id = ?
              AND link_id IN (SELECT id FROM links WHERE user_id = ?)`,
        params: [linkId, tagId, userId],
      });
    }

    // 5. Main link update (if any fields changed)
    if (Object.keys(updateData).length > 0) {
      const setClauses: string[] = [];
      const setParams: unknown[] = [];

      if (updateData.originalUrl !== undefined) {
        setClauses.push('original_url = ?');
        setParams.push(updateData.originalUrl);
      }
      if (updateData.slug !== undefined) {
        setClauses.push('slug = ?');
        setParams.push(updateData.slug);
      }
      if (updateData.folderId !== undefined) {
        setClauses.push('folder_id = ?');
        setParams.push(updateData.folderId);
      }
      if (updateData.expiresAt !== undefined) {
        setClauses.push('expires_at = ?');
        setParams.push(updateData.expiresAt ? Math.floor(updateData.expiresAt.getTime() / 1000) : null);
      }
      if (updateData.isCustom !== undefined) {
        setClauses.push('is_custom = ?');
        setParams.push(updateData.isCustom ? 1 : 0);
      }
      if (updateData.screenshotUrl !== undefined) {
        setClauses.push('screenshot_url = ?');
        setParams.push(updateData.screenshotUrl);
      }

      setParams.push(linkId, userId);
      statements.push({
        sql: `UPDATE links SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
        params: setParams,
      });
    }

    // Execute all statements atomically
    if (statements.length > 0) {
      await executeD1Batch(statements);
    }

    // Re-fetch the updated link
    const updatedLink = await db.getLinkById(linkId);

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

    return NextResponse.json({ link: linkToResponse(updatedLink) }, { headers: rateLimitHeaders });
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
  const authResult = await requireAuthWithRateLimit(request, "links:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
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

    return NextResponse.json({ success: true }, { headers: rateLimitHeaders });
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
    metaTitle: link.metaTitle,
    metaDescription: link.metaDescription,
    screenshotUrl: link.screenshotUrl,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}
