'use server';

import { getScopedDB, getAuthContext } from '@/lib/auth-context';
import { slugExists, getLinkBySlug } from '@/lib/db';
import { generateUniqueSlug, sanitizeSlug } from '@/lib/slug';
import { kvPutLink, kvDeleteLink } from '@/lib/kv/client';
import { markKVDirty } from '@/lib/kv/dirty';
import { validateUrl } from '@/lib/api/validation';
import type { Link } from '@/lib/db/schema';
import type { AnalyticsStats } from '@/models/types';

import type { CreateLinkInput, ActionResult } from './links/types';

/**
 * Create a new short link.
 */
export async function createLink(input: CreateLinkInput): Promise<ActionResult<Link>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db, userId } = ctx;

    // Validate URL
    const urlResult = validateUrl(input.originalUrl);
    if (typeof urlResult === 'string') {
      return { success: false, error: urlResult };
    }

    let slug: string;

    if (input.customSlug) {
      // Custom slug mode
      const sanitized = sanitizeSlug(input.customSlug);
      if (!sanitized) {
        return { success: false, error: 'Invalid slug format or reserved word' };
      }

      // Check if already exists (public query — no scope needed)
      if (await slugExists(sanitized)) {
        return { success: false, error: 'Slug already taken' };
      }

      slug = sanitized;
    } else {
      // Auto-generate slug
      slug = await generateUniqueSlug(slugExists);
    }

    const link = await db.createLink({
      originalUrl: input.originalUrl,
      slug,
      isCustom: !!input.customSlug,
      folderId: input.folderId,
      expiresAt: input.expiresAt,
      note: input.note || undefined,
      screenshotUrl: input.screenshotUrl || undefined,
    });

    // Fire-and-forget: associate tags with the newly created link
    if (input.tagIds?.length) {
      const tagIds = input.tagIds;
      void (async () => {
        try {
          for (const tagId of tagIds) {
            await db.addTagToLink(link.id, tagId);
          }
        } catch (err) {
          console.error('Failed to associate tags with link', link.id, err);
        }
      })();
    }

    // Fire-and-forget: sync to Cloudflare KV for edge redirect caching
    markKVDirty();
    void kvPutLink(link.slug, {
      id: link.id,
      originalUrl: link.originalUrl,
      expiresAt: link.expiresAt?.getTime() ?? null,
    });

    // Fire-and-forget: enrich the link with metadata asynchronously.
    // Metadata failure must never block link creation.
    void (async () => {
      try {
        const { enrichLink } = await import('@/actions/enrichment');
        await enrichLink(input.originalUrl, link.id, userId);
      } catch (err) {
        // Metadata is best-effort — log for observability but never block
        console.error('Failed to fetch/persist metadata for link', link.id, err);
      }
    })();

    return { success: true, data: link };
  } catch (error) {
    console.error('Failed to create link:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create link' 
    };
  }
}

/**
 * Get all links for the current user.
 */
export async function getLinks(): Promise<ActionResult<Link[]>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const links = await db.getLinks();
    return { success: true, data: links };
  } catch (error) {
    console.error('Failed to get links:', error);
    return { success: false, error: 'Failed to get links' };
  }
}

/**
 * Delete a link by ID.
 */
export async function deleteLink(linkId: number): Promise<ActionResult> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    // Fetch link before deletion to obtain slug for KV eviction
    const linkBeforeDelete = await db.getLinkById(linkId);

    const deleted = await db.deleteLink(linkId);
    if (!deleted) {
      return { success: false, error: 'Link not found or access denied' };
    }

    // Fire-and-forget: remove from Cloudflare KV
    markKVDirty();
    if (linkBeforeDelete) {
      void kvDeleteLink(linkBeforeDelete.slug);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete link:', error);
    return { success: false, error: 'Failed to delete link' };
  }
}

/**
 * Update a link.
 */
export async function updateLink(
  linkId: number,
  data: { originalUrl?: string; folderId?: string | null; expiresAt?: Date; slug?: string; screenshotUrl?: string | null }
): Promise<ActionResult<Link>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate URL if provided (same as createLink)
    if (data.originalUrl) {
      const urlResult = validateUrl(data.originalUrl);
      if (typeof urlResult === 'string') {
        return { success: false, error: urlResult };
      }
    }

    // Validate screenshotUrl if provided (allow null to clear)
    if (data.screenshotUrl !== undefined && data.screenshotUrl !== null) {
      try {
        new URL(data.screenshotUrl);
      } catch {
        return { success: false, error: 'Invalid screenshot URL' };
      }
    }

    // Validate and sanitize slug if provided
    const updateData: { originalUrl?: string; folderId?: string | null; expiresAt?: Date; slug?: string; isCustom?: boolean; screenshotUrl?: string | null } = {
      ...(data.originalUrl !== undefined && { originalUrl: data.originalUrl }),
      ...(data.folderId !== undefined && { folderId: data.folderId }),
      ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
      ...(data.screenshotUrl !== undefined && { screenshotUrl: data.screenshotUrl }),
    };

    // Fetch the old link to detect slug changes for KV eviction
    const oldLink = data.slug !== undefined ? await db.getLinkById(linkId) : null;

    if (data.slug !== undefined) {
      const sanitized = sanitizeSlug(data.slug);
      if (!sanitized) {
        return { success: false, error: 'Invalid slug: only letters, numbers, hyphens and underscores allowed (1-50 chars)' };
      }

      // Check uniqueness — allow if the slug belongs to the same link
      const existing = await getLinkBySlug(sanitized);
      if (existing && existing.id !== linkId) {
        return { success: false, error: 'This slug is already taken' };
      }

      updateData.slug = sanitized;
      updateData.isCustom = true;
    }

    const updated = await db.updateLink(linkId, updateData);
    if (!updated) {
      return { success: false, error: 'Link not found or access denied' };
    }

    // Fire-and-forget: sync updated link to Cloudflare KV
    markKVDirty();
    void kvPutLink(updated.slug, {
      id: updated.id,
      originalUrl: updated.originalUrl,
      expiresAt: updated.expiresAt?.getTime() ?? null,
    });
    // If slug changed, evict the old slug from KV
    if (oldLink && oldLink.slug !== updated.slug) {
      void kvDeleteLink(oldLink.slug);
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('Failed to update link:', error);
    return { success: false, error: 'Failed to update link' };
  }
}

/**
 * Update the note for a link.
 */
export async function updateLinkNote(
  linkId: number,
  note: string | null,
): Promise<ActionResult<Link>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const updated = await db.updateLinkNote(linkId, note);
    if (!updated) {
      return { success: false, error: 'Link not found or access denied' };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('Failed to update link note:', error);
    return { success: false, error: 'Failed to update link note' };
  }
}

/**
 * Get analytics stats for a specific link.
 * Ownership is enforced at the SQL level via ScopedDB JOIN.
 */
export async function getAnalyticsStats(linkId: number): Promise<ActionResult<AnalyticsStats>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const stats = await db.getAnalyticsStats(linkId);
    return { success: true, data: stats };
  } catch (error) {
    console.error('Failed to get analytics:', error);
    return { success: false, error: 'Failed to get analytics' };
  }
}
