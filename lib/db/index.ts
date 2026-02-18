/**
 * Database operations for Cloudflare D1.
 * Uses D1 HTTP API for Vercel deployment.
 */

import { executeD1Query } from './d1-client';
import type { Link, NewLink, Analytics, NewAnalytics, Folder, Webhook } from './schema';

// ============================================
// Type Conversion Helpers
// ============================================

function rowToLink(row: Record<string, unknown>): Link {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    folderId: row.folder_id as string | null,
    originalUrl: row.original_url as string,
    slug: row.slug as string,
    isCustom: Boolean(row.is_custom),
    expiresAt: row.expires_at ? new Date(row.expires_at as number) : null,
    clicks: row.clicks as number,
    metaTitle: (row.meta_title as string) ?? null,
    metaDescription: (row.meta_description as string) ?? null,
    metaFavicon: (row.meta_favicon as string) ?? null,
    screenshotUrl: (row.screenshot_url as string) ?? null,
    note: (row.note as string) ?? null,
    createdAt: new Date(row.created_at as number),
  };
}

function rowToAnalytics(row: Record<string, unknown>): Analytics {
  return {
    id: row.id as number,
    linkId: row.link_id as number,
    country: row.country as string | null,
    city: row.city as string | null,
    device: row.device as string | null,
    browser: row.browser as string | null,
    os: row.os as string | null,
    referer: row.referer as string | null,
    createdAt: new Date(row.created_at as number),
  };
}

// ============================================
// Link Operations
// ============================================

/**
 * Get a link by slug.
 */
export async function getLinkBySlug(slug: string): Promise<Link | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM links WHERE slug = ? LIMIT 1',
    [slug]
  );

  return rows[0] ? rowToLink(rows[0]) : null;
}

/**
 * Check if a slug exists.
 */
export async function slugExists(slug: string): Promise<boolean> {
  return (await getLinkBySlug(slug)) !== null;
}

/**
 * Create a new link.
 */
export async function createLink(data: Omit<NewLink, 'id' | 'createdAt'>): Promise<Link> {
  const now = Date.now();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO links (user_id, folder_id, original_url, slug, is_custom, expires_at, clicks, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [
      data.userId,
      data.folderId ?? null,
      data.originalUrl,
      data.slug,
      data.isCustom ? 1 : 0,
      data.expiresAt ? data.expiresAt.getTime() : null,
      data.clicks ?? 0,
      now,
    ]
  );

  return rowToLink(rows[0]);
}

/**
 * Find a link by user id and original URL.
 * Used for webhook idempotency — returns existing link if URL already shortened.
 */
export async function getLinkByUserAndUrl(userId: string, url: string): Promise<Link | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM links WHERE user_id = ? AND original_url = ? LIMIT 1',
    [userId, url]
  );

  return rows[0] ? rowToLink(rows[0]) : null;
}

/**
 * Get all links for a user.
 */
export async function getLinksByUserId(userId: string): Promise<Link[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );

  return rows.map(rowToLink);
}

/**
 * Delete a link by id and user id.
 * Returns true if deleted, false if not found or not authorized.
 */
export async function deleteLinkById(id: number, userId: string): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'DELETE FROM links WHERE id = ? AND user_id = ? RETURNING id',
    [id, userId]
  );

  return rows.length > 0;
}

/**
 * Update link by id and user id.
 */
export async function updateLink(
  id: number,
  userId: string,
  data: Partial<Pick<Link, 'originalUrl' | 'folderId' | 'expiresAt'>>
): Promise<Link | null> {
  // Build dynamic update query
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (data.originalUrl !== undefined) {
    setClauses.push('original_url = ?');
    params.push(data.originalUrl);
  }
  if (data.folderId !== undefined) {
    setClauses.push('folder_id = ?');
    params.push(data.folderId);
  }
  if (data.expiresAt !== undefined) {
    setClauses.push('expires_at = ?');
    params.push(data.expiresAt ? data.expiresAt.getTime() : null);
  }

  if (setClauses.length === 0) {
    // Nothing to update, just return the existing link
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM links WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return rows[0] ? rowToLink(rows[0]) : null;
  }

  params.push(id, userId);
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE links SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
    params
  );

  return rows[0] ? rowToLink(rows[0]) : null;
}

// ============================================
// Analytics Operations
// ============================================

/**
 * Record a click event for analytics.
 */
export async function recordClick(
  data: Omit<NewAnalytics, 'id' | 'createdAt'>
): Promise<Analytics> {
  const now = Date.now();

  // Insert analytics record
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO analytics (link_id, country, city, device, browser, os, referer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [
      data.linkId,
      data.country ?? null,
      data.city ?? null,
      data.device ?? null,
      data.browser ?? null,
      data.os ?? null,
      data.referer ?? null,
      now,
    ]
  );

  // Increment click count on the link
  await executeD1Query(
    'UPDATE links SET clicks = clicks + 1 WHERE id = ?',
    [data.linkId]
  );

  return rowToAnalytics(rows[0]);
}

/**
 * Get analytics records for a specific link.
 */
export async function getAnalyticsByLinkId(linkId: number): Promise<Analytics[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM analytics WHERE link_id = ? ORDER BY created_at DESC',
    [linkId]
  );

  return rows.map(rowToAnalytics);
}

/**
 * Get aggregated analytics stats for a link.
 */
export async function getAnalyticsStats(linkId: number): Promise<{
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM analytics WHERE link_id = ?',
    [linkId]
  );

  const records = rows.map(rowToAnalytics);
  const countries = new Set<string>();
  const devices: Record<string, number> = {};
  const browsers: Record<string, number> = {};
  const oses: Record<string, number> = {};

  for (const record of records) {
    if (record.country) countries.add(record.country);
    if (record.device) devices[record.device] = (devices[record.device] || 0) + 1;
    if (record.browser) browsers[record.browser] = (browsers[record.browser] || 0) + 1;
    if (record.os) oses[record.os] = (oses[record.os] || 0) + 1;
  }

  return {
    totalClicks: records.length,
    uniqueCountries: Array.from(countries),
    deviceBreakdown: devices,
    browserBreakdown: browsers,
    osBreakdown: oses,
  };
}

// ============================================
// Folder Operations (unscoped — for webhook route)
// ============================================

function rowToFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    icon: (row.icon as string) || 'folder',
    createdAt: new Date(row.created_at as number),
  };
}

/**
 * Find a folder by user id and name (case-insensitive).
 * Used by webhook route to resolve folder name to folder id.
 */
export async function getFolderByUserAndName(userId: string, name: string): Promise<Folder | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM folders WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
    [userId, name]
  );

  return rows[0] ? rowToFolder(rows[0]) : null;
}

// ============================================
// Webhook Operations (unscoped — for API route)
// ============================================

function rowToWebhook(row: Record<string, unknown>): Webhook {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    token: row.token as string,
    rateLimit: (row.rate_limit as number) ?? 5,
    createdAt: new Date(row.created_at as number),
  };
}

/**
 * Look up a webhook by its token (unscoped — used by the public API route).
 */
export async function getWebhookByToken(token: string): Promise<Webhook | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM webhooks WHERE token = ? LIMIT 1',
    [token]
  );
  return rows[0] ? rowToWebhook(rows[0]) : null;
}
