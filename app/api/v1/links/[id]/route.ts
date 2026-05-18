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
import { parseJsonBody, isErrorResponse } from "@/lib/api/validation";
import { linkToResponse } from "@/lib/api/serializers";
import { ScopedDB } from "@/lib/db/scoped";
import { executeD1Batch } from "@/lib/db/d1-client";
import { kvPutLink, kvDeleteLink } from "@/lib/kv/client";
import {
  validatePatchFields,
  validateTagOps,
  buildPatchStatements,
  type UpdateLinkData,
} from "./patch-helpers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseLinkId(id: string): number | NextResponse {
  const linkId = parseInt(id, 10);
  return isNaN(linkId) ? apiError("Invalid link ID", 400) : linkId;
}

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
  if (authResult instanceof NextResponse) return authResult;

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const linkId = parseLinkId(id);
  if (linkId instanceof NextResponse) return linkId;

  try {
    const db = new ScopedDB(userId);
    const link = await db.getLinkById(linkId);
    if (!link) return apiError("Link not found", 404);

    const tags = await db.getTagsForLink(link.id);

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/links/${id}`,
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json(
      { link: linkToResponse(link, tags) },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error(`[/api/v1/links/${id} GET]`, error);
    return apiError("Internal server error", 500);
  }
}

/** Sync KV cache after a PATCH that may have changed slug / URL / expiration. */
function syncKvAfterPatch(
  oldSlug: string,
  updatedLink: { id: number; slug: string; originalUrl: string; expiresAt: Date | null },
  updateData: UpdateLinkData,
) {
  const newSlug = updatedLink.slug;
  if (oldSlug !== newSlug) {
    kvDeleteLink(oldSlug).catch(() => {});
    kvPutLink(newSlug, {
      id: updatedLink.id,
      originalUrl: updatedLink.originalUrl,
      expiresAt: updatedLink.expiresAt ? updatedLink.expiresAt.getTime() : null,
    }).catch(() => {});
  } else if (updateData.originalUrl || updateData.expiresAt !== undefined) {
    kvPutLink(newSlug, {
      id: updatedLink.id,
      originalUrl: updatedLink.originalUrl,
      expiresAt: updatedLink.expiresAt ? updatedLink.expiresAt.getTime() : null,
    }).catch(() => {});
  }
}

/**
 * PATCH /api/v1/links/[id]
 *
 * Body (all optional):
 *   - originalUrl, slug, folderId, expiresAt, note, metaTitle, metaDescription,
 *     screenshotUrl, addTags, removeTags
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "links:write");
  if (authResult instanceof NextResponse) return authResult;

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const linkId = parseLinkId(id);
  if (linkId instanceof NextResponse) return linkId;

  try {
    const db = new ScopedDB(userId);

    const bodyResult = await parseJsonBody(request);
    if (isErrorResponse(bodyResult)) return bodyResult;
    const bodyObj = bodyResult;

    const existingLink = await db.getLinkById(linkId);
    if (!existingLink) return apiError("Link not found", 404);

    // === VALIDATION PHASE ===
    const fieldResult = await validatePatchFields(db, bodyObj, existingLink);
    if (fieldResult instanceof NextResponse) return fieldResult;

    const tagResult = await validateTagOps(db, linkId, bodyObj);
    if (tagResult instanceof NextResponse) return tagResult;

    // === WRITE PHASE ===
    const statements = buildPatchStatements(linkId, userId, {
      updateData: fieldResult.updateData,
      noteUpdate: fieldResult.noteUpdate,
      metaTitle: fieldResult.metaTitle,
      metaDescription: fieldResult.metaDescription,
      tagsToAdd: tagResult.tagsToAdd,
      tagsToRemove: tagResult.tagsToRemove,
    });

    if (statements.length > 0) {
      await executeD1Batch(statements);
    }

    const updatedLink = await db.getLinkById(linkId);
    if (!updatedLink) return apiError("Link not found", 404);

    const updatedTags = await db.getTagsForLink(updatedLink.id);

    syncKvAfterPatch(existingLink.slug, updatedLink, fieldResult.updateData);

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: `/api/v1/links/${id}`,
      method: "PATCH",
      statusCode: 200,
    });

    return NextResponse.json(
      { link: linkToResponse(updatedLink, updatedTags) },
      { headers: rateLimitHeaders },
    );
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
  if (authResult instanceof NextResponse) return authResult;

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;
  const { id } = await context.params;
  const linkId = parseLinkId(id);
  if (linkId instanceof NextResponse) return linkId;

  try {
    const db = new ScopedDB(userId);

    const link = await db.getLinkById(linkId);
    if (!link) return apiError("Link not found", 404);

    const deleted = await db.deleteLink(linkId);
    if (!deleted) return apiError("Link not found", 404);

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
