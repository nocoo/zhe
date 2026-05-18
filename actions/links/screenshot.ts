'use server';

import { getAuthContext } from '@/lib/auth-context';
import { uploadBufferToR2 } from '@/lib/r2/client';
import { hashUserId, generateObjectKey, buildPublicUrl } from '@/models/upload';
import type { Link } from '@/lib/db/schema';
import type { ActionResult } from './types';

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
      return {
        success: false,
        error: `${source === 'microlink' ? 'Microlink' : 'Screenshot Domains'} did not return a valid screenshot`,
      };
    }

    // Step 2: delegate to saveScreenshot for download → R2 → DB
    return saveScreenshot(linkId, tempUrl);
  } catch (error) {
    console.error('Failed to fetch and save screenshot:', error);
    return { success: false, error: 'Failed to fetch and save screenshot' };
  }
}

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB
const SCREENSHOT_TIMEOUT_MS = 15_000;

/** Validate URL is HTTPS and well-formed. Returns null if OK, otherwise an error message. */
function validateScreenshotUrl(screenshotUrl: string): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(screenshotUrl);
  } catch {
    return 'Invalid screenshot URL';
  }
  if (parsedUrl.protocol !== 'https:') return 'Only HTTPS URLs are allowed';
  return null;
}

/** Fetch the screenshot body with size + timeout limits. */
async function downloadScreenshot(
  screenshotUrl: string,
): Promise<{ buffer: Uint8Array; contentType: string } | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCREENSHOT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(screenshotUrl, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error && err.name === 'AbortError'
      ? 'Screenshot download timed out'
      : 'Failed to download screenshot';
    return { error: message };
  }
  clearTimeout(timeout);
  if (!res.ok) return { error: 'Failed to download screenshot' };

  const declaredLength = Number(res.headers.get('content-length') || '0');
  if (declaredLength > MAX_SCREENSHOT_BYTES) return { error: 'Screenshot too large' };

  const contentType = res.headers.get('content-type') || 'image/png';
  const rawBuffer = await res.arrayBuffer();
  if (rawBuffer.byteLength > MAX_SCREENSHOT_BYTES) return { error: 'Screenshot too large' };

  return { buffer: new Uint8Array(rawBuffer), contentType };
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

    const urlError = validateScreenshotUrl(screenshotUrl);
    if (urlError) return { success: false, error: urlError };

    const dl = await downloadScreenshot(screenshotUrl);
    if ('error' in dl) return { success: false, error: dl.error };

    // Generate R2 key and upload
    const salt = process.env.R2_USER_HASH_SALT;
    if (!salt) return { success: false, error: 'R2 user hash salt not configured' };
    const userHash = await hashUserId(ctx.userId, salt);
    const key = generateObjectKey('screenshot.png', userHash);
    await uploadBufferToR2(key, dl.buffer, dl.contentType);

    // Build the permanent R2 public URL
    const publicDomain = process.env.R2_PUBLIC_DOMAIN;
    if (!publicDomain) return { success: false, error: 'R2 public domain not configured' };
    const r2Url = buildPublicUrl(publicDomain, key);

    // Persist the R2 URL in the DB
    const updated = await ctx.db.updateLinkScreenshot(linkId, r2Url);
    if (!updated) return { success: false, error: 'Link not found or access denied' };

    return { success: true, data: updated };
  } catch (error) {
    console.error('Failed to save screenshot:', error);
    return { success: false, error: 'Failed to save screenshot' };
  }
}
