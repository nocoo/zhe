'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import { slugExists } from '@/lib/db';
import { generateUniqueSlug, sanitizeSlug } from '@/lib/slug';
import { fetchMetadata } from '@/lib/metadata';
import type { Link } from '@/lib/db/schema';

/**
 * Get a ScopedDB instance for the current authenticated user.
 * Returns null if not authenticated.
 */
async function getScopedDB(): Promise<ScopedDB | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return new ScopedDB(userId);
}

export interface CreateLinkInput {
  originalUrl: string;
  customSlug?: string;
  folderId?: string;
  expiresAt?: Date;
}

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new short link.
 */
export async function createLink(input: CreateLinkInput): Promise<ActionResult<Link>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate URL
    try {
      new URL(input.originalUrl);
    } catch {
      return { success: false, error: 'Invalid URL' };
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
    });

    // Fire-and-forget: fetch metadata and update the link asynchronously.
    // Metadata failure must never block link creation.
    void (async () => {
      try {
        const meta = await fetchMetadata(input.originalUrl);
        if (meta.title || meta.description || meta.favicon) {
          await db.updateLinkMetadata(link.id, {
            metaTitle: meta.title,
            metaDescription: meta.description,
            metaFavicon: meta.favicon,
          });
        }
      } catch {
        // Silently ignore — metadata is best-effort
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

    const deleted = await db.deleteLink(linkId);
    if (!deleted) {
      return { success: false, error: 'Link not found or access denied' };
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
  data: { originalUrl?: string; folderId?: string; expiresAt?: Date }
): Promise<ActionResult<Link>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate URL if provided
    if (data.originalUrl) {
      try {
        new URL(data.originalUrl);
      } catch {
        return { success: false, error: 'Invalid URL' };
      }
    }

    const updated = await db.updateLink(linkId, data);
    if (!updated) {
      return { success: false, error: 'Link not found or access denied' };
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

export interface AnalyticsStats {
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
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

/**
 * Manually refresh metadata for a link.
 * Re-fetches title, description, and favicon from the original URL.
 */
export async function refreshLinkMetadata(linkId: number): Promise<ActionResult<Link>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const link = await db.getLinkById(linkId);
    if (!link) {
      return { success: false, error: 'Link not found or access denied' };
    }

    const meta = await fetchMetadata(link.originalUrl);
    const updated = await db.updateLinkMetadata(linkId, {
      metaTitle: meta.title,
      metaDescription: meta.description,
      metaFavicon: meta.favicon,
    });

    return { success: true, data: updated! };
  } catch (error) {
    console.error('Failed to refresh metadata:', error);
    return { success: false, error: 'Failed to refresh metadata' };
  }
}

/**
 * Persist a screenshot URL for a link.
 * Called by the client after fetching from Microlink API.
 */
export async function saveScreenshot(
  linkId: number,
  screenshotUrl: string,
): Promise<ActionResult<Link>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const updated = await db.updateLinkScreenshot(linkId, screenshotUrl);
    if (!updated) {
      return { success: false, error: 'Link not found or access denied' };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('Failed to save screenshot:', error);
    return { success: false, error: 'Failed to save screenshot' };
  }
}
