'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import { slugExists, getLinkBySlug } from '@/lib/db';
import { generateUniqueSlug, sanitizeSlug } from '@/lib/slug';
import { fetchMetadata } from '@/lib/metadata';
import { uploadBufferToR2 } from '@/lib/r2/client';
import { hashUserId, generateObjectKey, buildPublicUrl } from '@/models/upload';
import { isTwitterUrl } from '@/models/links';
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

/**
 * Get a ScopedDB instance and userId for the current authenticated user.
 * Returns null if not authenticated.
 */
async function getAuthContext(): Promise<{ db: ScopedDB; userId: string } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return { db: new ScopedDB(userId), userId };
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
        if (isTwitterUrl(input.originalUrl)) {
          // X links: use xray API + cache instead of generic metadata fetch
          const { fetchAndCacheTweet } = await import('@/actions/xray');
          await fetchAndCacheTweet(input.originalUrl, link.id);
        } else {
          const meta = await fetchMetadata(input.originalUrl);
          if (meta.title || meta.description || meta.favicon) {
            await db.updateLinkMetadata(link.id, {
              metaTitle: meta.title,
              metaDescription: meta.description,
              metaFavicon: meta.favicon,
            });
          }
        }
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
  data: { originalUrl?: string; folderId?: string; expiresAt?: Date; slug?: string; screenshotUrl?: string | null }
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

    // Validate screenshotUrl if provided (allow null to clear)
    if (data.screenshotUrl !== undefined && data.screenshotUrl !== null) {
      try {
        new URL(data.screenshotUrl);
      } catch {
        return { success: false, error: 'Invalid screenshot URL' };
      }
    }

    // Validate and sanitize slug if provided
    const updateData: { originalUrl?: string; folderId?: string; expiresAt?: Date; slug?: string; isCustom?: boolean; screenshotUrl?: string | null } = {
      originalUrl: data.originalUrl,
      folderId: data.folderId,
      expiresAt: data.expiresAt,
      screenshotUrl: data.screenshotUrl,
    };

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

    if (isTwitterUrl(link.originalUrl)) {
      // X links: force-refresh via xray API + cache
      const { forceRefreshTweetCache } = await import('@/actions/xray');
      const result = await forceRefreshTweetCache(link.originalUrl, linkId);
      if (!result.success) {
        return { success: false, error: result.error ?? 'Failed to refresh tweet metadata' };
      }
      // Re-fetch the updated link
      const updated = await db.getLinkById(linkId);
      return { success: true, data: updated! };
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
 * Fetch a screenshot from the given source entirely on the server, upload it
 * to R2, and persist the permanent URL in the DB.
 *
 * This avoids CORS issues that occur when the browser tries to reach
 * screenshot.domains directly (the CDN redirect lacks Access-Control headers).
 */
export async function fetchAndSaveScreenshot(
  linkId: number,
  originalUrl: string,
  source: 'microlink' | 'screenshotDomains',
): Promise<ActionResult<Link>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }

    // Step 1: resolve screenshot URL on the server (no CORS)
    const { fetchMicrolinkScreenshot, fetchScreenshotDomains } = await import('@/models/links');
    const tempUrl = source === 'microlink'
      ? await fetchMicrolinkScreenshot(originalUrl)
      : await fetchScreenshotDomains(originalUrl);

    if (!tempUrl) {
      return { success: false, error: `${source === 'microlink' ? 'Microlink' : 'Screenshot Domains'} did not return a valid screenshot` };
    }

    // Step 2: delegate to saveScreenshot for download → R2 → DB
    return saveScreenshot(linkId, tempUrl);
  } catch (error) {
    console.error('Failed to fetch and save screenshot:', error);
    return { success: false, error: 'Failed to fetch and save screenshot' };
  }
}

/**
 * Download a screenshot from an external URL, upload it to R2, and persist
 * the permanent R2 public URL in the DB.
 *
 * Called by the client after fetching a temporary screenshot URL from Microlink,
 * or internally by fetchAndSaveScreenshot.
 */
export async function saveScreenshot(
  linkId: number,
  screenshotUrl: string,
): Promise<ActionResult<Link>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }

    // SSRF defense: validate URL before fetching
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(screenshotUrl);
    } catch {
      return { success: false, error: 'Invalid screenshot URL' };
    }
    if (parsedUrl.protocol !== 'https:') {
      return { success: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Download the screenshot image with timeout and size limit
    const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(screenshotUrl, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      const message = err instanceof Error && err.name === 'AbortError'
        ? 'Screenshot download timed out'
        : 'Failed to download screenshot';
      return { success: false, error: message };
    }
    clearTimeout(timeout);
    if (!res.ok) {
      return { success: false, error: 'Failed to download screenshot' };
    }

    // Reject responses that declare an oversized Content-Length upfront
    const declaredLength = Number(res.headers.get('content-length') || '0');
    if (declaredLength > MAX_SCREENSHOT_BYTES) {
      return { success: false, error: 'Screenshot too large' };
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    const rawBuffer = await res.arrayBuffer();
    if (rawBuffer.byteLength > MAX_SCREENSHOT_BYTES) {
      return { success: false, error: 'Screenshot too large' };
    }
    const buffer = new Uint8Array(rawBuffer);

    // Generate R2 key and upload
    const salt = process.env.R2_USER_HASH_SALT;
    if (!salt) {
      return { success: false, error: 'R2 user hash salt not configured' };
    }
    const userHash = await hashUserId(ctx.userId, salt);
    const key = generateObjectKey('screenshot.png', userHash);
    await uploadBufferToR2(key, buffer, contentType);

    // Build the permanent R2 public URL
    const publicDomain = process.env.R2_PUBLIC_DOMAIN;
    if (!publicDomain) {
      return { success: false, error: 'R2 public domain not configured' };
    }
    const r2Url = buildPublicUrl(publicDomain, key);

    // Persist the R2 URL in the DB
    const updated = await ctx.db.updateLinkScreenshot(linkId, r2Url);
    if (!updated) {
      return { success: false, error: 'Link not found or access denied' };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('Failed to save screenshot:', error);
    return { success: false, error: 'Failed to save screenshot' };
  }
}
