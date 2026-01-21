/**
 * Database client for Cloudflare D1.
 * Uses direct HTTP API calls to D1 for Vercel deployment.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import * as schema from './schema';
import type { Link, NewLink, Analytics, NewAnalytics } from './schema';

// ============================================
// D1 HTTP Client
// ============================================

interface D1Response<T> {
  success: boolean;
  result: Array<{
    results: T[];
    success: boolean;
    meta: {
      changes: number;
      last_row_id: number;
      rows_read: number;
      rows_written: number;
    };
  }>;
  errors: Array<{ message: string }>;
}

async function executeD1Query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error('D1 credentials not configured');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`D1 query failed: ${error}`);
  }

  const data: D1Response<T> = await response.json();

  if (!data.success) {
    throw new Error(`D1 query failed: ${data.errors.map((e) => e.message).join(', ')}`);
  }

  return data.result[0]?.results || [];
}

// Check if we're in mock mode (for testing)
const isMockMode = () => {
  return (
    process.env.NODE_ENV === 'test' ||
    !process.env.CLOUDFLARE_ACCOUNT_ID ||
    !process.env.CLOUDFLARE_D1_DATABASE_ID ||
    !process.env.CLOUDFLARE_API_TOKEN
  );
};

// ============================================
// Mock Storage (for testing)
// ============================================

const mockStorage: Map<string, Link> = new Map();
let nextId = 1;
const analyticsStorage: Analytics[] = [];
let nextAnalyticsId = 1;

export function clearMockStorage(): void {
  mockStorage.clear();
  analyticsStorage.length = 0;
  nextId = 1;
  nextAnalyticsId = 1;
}

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
  if (isMockMode()) {
    for (const link of mockStorage.values()) {
      if (link.slug === slug) {
        return link;
      }
    }
    return null;
  }

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
  if (isMockMode()) {
    const link: Link = {
      id: nextId++,
      userId: data.userId,
      folderId: data.folderId ?? null,
      originalUrl: data.originalUrl,
      slug: data.slug,
      isCustom: data.isCustom ?? false,
      expiresAt: data.expiresAt ?? null,
      clicks: data.clicks ?? 0,
      createdAt: new Date(),
    };
    mockStorage.set(link.slug, link);
    return link;
  }

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
 * Get all links for a user.
 */
export async function getLinksByUserId(userId: string): Promise<Link[]> {
  if (isMockMode()) {
    const links: Link[] = [];
    for (const link of mockStorage.values()) {
      if (link.userId === userId) {
        links.push(link);
      }
    }
    return links.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

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
  if (isMockMode()) {
    for (const [slug, link] of mockStorage.entries()) {
      if (link.id === id && link.userId === userId) {
        mockStorage.delete(slug);
        return true;
      }
    }
    return false;
  }

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
  if (isMockMode()) {
    for (const [slug, link] of mockStorage.entries()) {
      if (link.id === id && link.userId === userId) {
        const updated = { ...link, ...data };
        mockStorage.set(slug, updated);
        return updated;
      }
    }
    return null;
  }

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

/**
 * Increment click count for a link.
 */
export async function incrementClicks(slug: string): Promise<void> {
  if (isMockMode()) {
    const link = mockStorage.get(slug);
    if (link) {
      link.clicks = (link.clicks ?? 0) + 1;
    }
    return;
  }

  await executeD1Query(
    'UPDATE links SET clicks = clicks + 1 WHERE slug = ?',
    [slug]
  );
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
  if (isMockMode()) {
    const record: Analytics = {
      id: nextAnalyticsId++,
      linkId: data.linkId,
      country: data.country ?? null,
      city: data.city ?? null,
      device: data.device ?? null,
      browser: data.browser ?? null,
      os: data.os ?? null,
      referer: data.referer ?? null,
      createdAt: new Date(),
    };
    analyticsStorage.push(record);

    // Also increment the click count on the link
    for (const link of mockStorage.values()) {
      if (link.id === data.linkId) {
        link.clicks = (link.clicks ?? 0) + 1;
        break;
      }
    }

    return record;
  }

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
  if (isMockMode()) {
    return analyticsStorage
      .filter((a) => a.linkId === linkId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

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
  if (isMockMode()) {
    const records = analyticsStorage.filter((a) => a.linkId === linkId);

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

/**
 * Get analytics for all links owned by a user.
 */
export async function getAnalyticsByUserId(userId: string): Promise<Analytics[]> {
  if (isMockMode()) {
    const userLinks = await getLinksByUserId(userId);
    const linkIds = new Set(userLinks.map((l) => l.id));

    return analyticsStorage
      .filter((a) => linkIds.has(a.linkId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Get user's link IDs first
  const userLinks = await getLinksByUserId(userId);
  const linkIds = userLinks.map((l) => l.id);

  if (linkIds.length === 0) {
    return [];
  }

  // Build IN clause
  const placeholders = linkIds.map(() => '?').join(', ');
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT * FROM analytics WHERE link_id IN (${placeholders}) ORDER BY created_at DESC`,
    linkIds
  );

  return rows.map(rowToAnalytics);
}
