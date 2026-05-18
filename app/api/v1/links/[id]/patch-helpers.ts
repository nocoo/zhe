/**
 * Helpers for PATCH /api/v1/links/[id] — keeps the route handler small.
 *
 * Three pure-ish helpers:
 *  - validatePatchBody: validate request body fields → update data, tag ops, or error
 *  - validateTagOps:    verify tag IDs exist / are associated with the link
 *  - buildPatchStatements: produce the D1 batch statements
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/auth";
import { slugExists } from "@/lib/db";
import { ScopedDB } from "@/lib/db/scoped";
import type { Link } from "@/lib/db/schema";
import type { D1Statement } from "@/lib/db/d1-client";

export type UpdateLinkData = Partial<
  Pick<Link, "originalUrl" | "slug" | "folderId" | "expiresAt" | "isCustom" | "screenshotUrl">
>;

export interface PatchPlan {
  updateData: UpdateLinkData;
  noteUpdate?: string | null | undefined;
  metaTitle?: string | null | undefined;
  metaDescription?: string | null | undefined;
  tagsToAdd: string[];
  tagsToRemove: string[];
}

/**
 * Validate URL/slug/folderId/expiresAt/screenshotUrl/note/meta* fields.
 * Returns either a NextResponse error or the parsed updateData + raw meta/note flags.
 */
export async function validatePatchFields(
  db: ScopedDB,
  bodyObj: Record<string, unknown>,
  existingLink: Link,
): Promise<NextResponse | {
  updateData: UpdateLinkData;
  noteUpdate?: string | null | undefined;
  metaTitle?: string | null | undefined;
  metaDescription?: string | null | undefined;
}> {
  const updateData: UpdateLinkData = {};

  if (bodyObj.originalUrl !== undefined) {
    if (typeof bodyObj.originalUrl !== "string") {
      return apiError("originalUrl must be a string", 400);
    }
    try { new URL(bodyObj.originalUrl); } catch { return apiError("Invalid URL format", 400); }
    updateData.originalUrl = bodyObj.originalUrl;
  }

  if (bodyObj.slug !== undefined && bodyObj.slug !== existingLink.slug) {
    if (typeof bodyObj.slug !== "string") return apiError("slug must be a string", 400);
    if (!/^[a-zA-Z0-9_-]+$/.test(bodyObj.slug)) {
      return apiError("Invalid slug format. Use only letters, numbers, hyphens, and underscores.", 400);
    }
    if (bodyObj.slug.length < 3 || bodyObj.slug.length > 50) {
      return apiError("Slug must be between 3 and 50 characters", 400);
    }
    if (await slugExists(bodyObj.slug)) return apiError("Slug already in use", 409);
    updateData.slug = bodyObj.slug;
    updateData.isCustom = true;
  }

  if (bodyObj.folderId !== undefined) {
    if (bodyObj.folderId !== null && typeof bodyObj.folderId !== "string") {
      return apiError("folderId must be a string or null", 400);
    }
    if (bodyObj.folderId !== null) {
      const folder = await db.getFolderById(bodyObj.folderId);
      if (!folder) return apiError("Folder not found", 404);
    }
    updateData.folderId = bodyObj.folderId as string | null;
  }

  if (bodyObj.expiresAt !== undefined) {
    if (bodyObj.expiresAt !== null && typeof bodyObj.expiresAt !== "string") {
      return apiError("expiresAt must be a string (ISO 8601 format) or null", 400);
    }
    if (bodyObj.expiresAt !== null) {
      const parsed = new Date(bodyObj.expiresAt);
      if (isNaN(parsed.getTime())) return apiError("Invalid expiresAt format. Use ISO 8601.", 400);
      if (parsed.getTime() <= Date.now()) return apiError("Expiration date must be in the future", 400);
      updateData.expiresAt = parsed;
    } else {
      updateData.expiresAt = null;
    }
  }

  if (bodyObj.screenshotUrl !== undefined) {
    if (bodyObj.screenshotUrl !== null && typeof bodyObj.screenshotUrl !== "string") {
      return apiError("screenshotUrl must be a string or null", 400);
    }
    if (bodyObj.screenshotUrl !== null) {
      try { new URL(bodyObj.screenshotUrl); } catch { return apiError("Invalid screenshotUrl format", 400); }
    }
    updateData.screenshotUrl = bodyObj.screenshotUrl as string | null;
  }

  if (bodyObj.note !== undefined && bodyObj.note !== null && typeof bodyObj.note !== "string") {
    return apiError("note must be a string or null", 400);
  }
  if (bodyObj.metaTitle !== undefined && bodyObj.metaTitle !== null && typeof bodyObj.metaTitle !== "string") {
    return apiError("metaTitle must be a string or null", 400);
  }
  if (bodyObj.metaDescription !== undefined && bodyObj.metaDescription !== null && typeof bodyObj.metaDescription !== "string") {
    return apiError("metaDescription must be a string or null", 400);
  }

  return {
    updateData,
    noteUpdate: bodyObj.note as string | null | undefined,
    metaTitle: bodyObj.metaTitle as string | null | undefined,
    metaDescription: bodyObj.metaDescription as string | null | undefined,
  };
}
/** Validate addTags / removeTags arrays, returning resolved ID arrays or an error. */
export async function validateTagOps(
  db: ScopedDB,
  linkId: number,
  bodyObj: Record<string, unknown>,
): Promise<NextResponse | { tagsToAdd: string[]; tagsToRemove: string[] }> {
  const tagsToAdd: string[] = [];
  const tagsToRemove: string[] = [];

  if (bodyObj.addTags !== undefined) {
    if (!Array.isArray(bodyObj.addTags)) return apiError("addTags must be an array", 400);
    for (const tagId of bodyObj.addTags) {
      if (typeof tagId !== "string") return apiError("All tag IDs in addTags must be strings", 400);
      const tag = await db.getTagById(tagId);
      if (!tag) return apiError(`Tag not found: ${tagId}`, 400);
      tagsToAdd.push(tagId);
    }
  }

  if (bodyObj.removeTags !== undefined) {
    if (!Array.isArray(bodyObj.removeTags)) return apiError("removeTags must be an array", 400);
    const currentLinkTags = await db.getTagsForLink(linkId);
    const currentTagIds = new Set(currentLinkTags.map(t => t.id));
    for (const tagId of bodyObj.removeTags) {
      if (typeof tagId !== "string") return apiError("All tag IDs in removeTags must be strings", 400);
      if (!currentTagIds.has(tagId)) return apiError(`Tag not associated with this link: ${tagId}`, 400);
      tagsToRemove.push(tagId);
    }
  }

  return { tagsToAdd, tagsToRemove };
}

/** Build the atomic D1 batch for a PATCH plan. */
export function buildPatchStatements(
  linkId: number,
  userId: string,
  plan: PatchPlan,
): D1Statement[] {
  const statements: D1Statement[] = [];

  if (plan.noteUpdate !== undefined) {
    statements.push({
      sql: 'UPDATE links SET note = ? WHERE id = ? AND user_id = ?',
      params: [plan.noteUpdate, linkId, userId],
    });
  }

  if (plan.metaTitle !== undefined || plan.metaDescription !== undefined) {
    const metaClauses: string[] = [];
    const metaParams: unknown[] = [];
    if (plan.metaTitle !== undefined) { metaClauses.push('meta_title = ?'); metaParams.push(plan.metaTitle); }
    if (plan.metaDescription !== undefined) { metaClauses.push('meta_description = ?'); metaParams.push(plan.metaDescription); }
    metaParams.push(linkId, userId);
    statements.push({
      sql: `UPDATE links SET ${metaClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      params: metaParams,
    });
  }

  for (const tagId of plan.tagsToAdd) {
    statements.push({
      sql: 'INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)',
      params: [linkId, tagId],
    });
  }

  for (const tagId of plan.tagsToRemove) {
    statements.push({
      sql: `DELETE FROM link_tags WHERE link_id = ? AND tag_id = ?
            AND link_id IN (SELECT id FROM links WHERE user_id = ?)`,
      params: [linkId, tagId, userId],
    });
  }

  const u = plan.updateData;
  if (Object.keys(u).length > 0) {
    const setClauses: string[] = [];
    const setParams: unknown[] = [];
    if (u.originalUrl !== undefined) { setClauses.push('original_url = ?'); setParams.push(u.originalUrl); }
    if (u.slug !== undefined) { setClauses.push('slug = ?'); setParams.push(u.slug); }
    if (u.folderId !== undefined) { setClauses.push('folder_id = ?'); setParams.push(u.folderId); }
    if (u.expiresAt !== undefined) {
      setClauses.push('expires_at = ?');
      setParams.push(u.expiresAt ? u.expiresAt.getTime() : null);
    }
    if (u.isCustom !== undefined) { setClauses.push('is_custom = ?'); setParams.push(u.isCustom ? 1 : 0); }
    if (u.screenshotUrl !== undefined) { setClauses.push('screenshot_url = ?'); setParams.push(u.screenshotUrl); }
    setParams.push(linkId, userId);
    statements.push({
      sql: `UPDATE links SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      params: setParams,
    });
  }

  return statements;
}
