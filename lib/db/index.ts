/**
 * Database operations for Cloudflare D1.
 * Uses D1 HTTP API for Vercel deployment.
 */

import { executeD1Query, executeD1Batch } from './d1-client';
import type { Link, NewLink, Analytics, NewAnalytics, Folder, Webhook, TweetCache } from './schema';

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
 * Check if a slug exists (uses COUNT to avoid fetching full row).
 */
export async function slugExists(slug: string): Promise<boolean> {
  const rows = await executeD1Query<{ cnt: number }>(
    'SELECT COUNT(1) AS cnt FROM links WHERE slug = ? LIMIT 1',
    [slug]
  );
  return (rows[0]?.cnt ?? 0) > 0;
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

  // Batch: insert analytics record + increment click count in a single D1 request
  const [insertRows] = await executeD1Batch<Record<string, unknown>>([
    {
      sql: `INSERT INTO analytics (link_id, country, city, device, browser, os, referer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
      params: [
        data.linkId,
        data.country ?? null,
        data.city ?? null,
        data.device ?? null,
        data.browser ?? null,
        data.os ?? null,
        data.referer ?? null,
        now,
      ],
    },
    {
      sql: 'UPDATE links SET clicks = clicks + 1 WHERE id = ?',
      params: [data.linkId],
    },
  ]);

  return rowToAnalytics(insertRows[0]);
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
 * Uses SQL aggregation instead of fetching all rows.
 */
export async function getAnalyticsStats(linkId: number): Promise<{
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}> {
  // Run all aggregation queries in parallel
  const [countRows, countryRows, deviceRows, browserRows, osRows] = await Promise.all([
    executeD1Query<Record<string, unknown>>(
      'SELECT COUNT(*) as total FROM analytics WHERE link_id = ?',
      [linkId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT DISTINCT country FROM analytics WHERE link_id = ? AND country IS NOT NULL',
      [linkId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT device, COUNT(*) as count FROM analytics WHERE link_id = ? AND device IS NOT NULL GROUP BY device',
      [linkId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT browser, COUNT(*) as count FROM analytics WHERE link_id = ? AND browser IS NOT NULL GROUP BY browser',
      [linkId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT os, COUNT(*) as count FROM analytics WHERE link_id = ? AND os IS NOT NULL GROUP BY os',
      [linkId],
    ),
  ]);

  const totalClicks = (countRows[0]?.total as number) ?? 0;
  const uniqueCountries = countryRows.map(r => r.country as string);

  const deviceBreakdown: Record<string, number> = {};
  for (const r of deviceRows) deviceBreakdown[r.device as string] = r.count as number;

  const browserBreakdown: Record<string, number> = {};
  for (const r of browserRows) browserBreakdown[r.browser as string] = r.count as number;

  const osBreakdown: Record<string, number> = {};
  for (const r of osRows) osBreakdown[r.os as string] = r.count as number;

  return {
    totalClicks,
    uniqueCountries,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
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

/**
 * Get stats for a webhook user: total links, total clicks, 5 most recent links.
 * Used by GET /api/webhook/[token] to return useful summary info.
 */
export async function getWebhookStats(userId: string): Promise<{
  totalLinks: number;
  totalClicks: number;
  recentLinks: { slug: string; originalUrl: string; clicks: number; createdAt: string }[];
}> {
  const [countRows, recentRows] = await Promise.all([
    executeD1Query<Record<string, unknown>>(
      'SELECT COUNT(*) AS cnt, COALESCE(SUM(clicks), 0) AS total_clicks FROM links WHERE user_id = ?',
      [userId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT slug, original_url, clicks, created_at FROM links WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [userId],
    ),
  ]);

  return {
    totalLinks: (countRows[0]?.cnt as number) ?? 0,
    totalClicks: (countRows[0]?.total_clicks as number) ?? 0,
    recentLinks: recentRows.map((r) => ({
      slug: r.slug as string,
      originalUrl: r.original_url as string,
      clicks: r.clicks as number,
      createdAt: new Date(r.created_at as number).toISOString(),
    })),
  };
}

// ============================================
// Tweet Cache Operations (public — shared across users)
// ============================================

function rowToTweetCache(row: Record<string, unknown>): TweetCache {
  return {
    tweetId: row.tweet_id as string,
    authorUsername: row.author_username as string,
    authorName: row.author_name as string,
    authorAvatar: row.author_avatar as string,
    tweetText: row.tweet_text as string,
    tweetUrl: row.tweet_url as string,
    lang: (row.lang as string) ?? null,
    tweetCreatedAt: row.tweet_created_at as string,
    rawData: row.raw_data as string,
    fetchedAt: row.fetched_at as number,
    updatedAt: row.updated_at as number,
  };
}

/**
 * Get a cached tweet by its tweet ID.
 */
export async function getTweetCacheById(tweetId: string): Promise<TweetCache | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM tweet_cache WHERE tweet_id = ? LIMIT 1',
    [tweetId]
  );
  return rows[0] ? rowToTweetCache(rows[0]) : null;
}

/**
 * Get multiple cached tweets by their IDs.
 * Returns a Map keyed by tweet ID for O(1) lookup.
 */
export async function getTweetCacheByIds(tweetIds: string[]): Promise<Map<string, TweetCache>> {
  if (tweetIds.length === 0) return new Map();

  const placeholders = tweetIds.map(() => '?').join(', ');
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT * FROM tweet_cache WHERE tweet_id IN (${placeholders})`,
    tweetIds
  );

  const map = new Map<string, TweetCache>();
  for (const row of rows) {
    const cached = rowToTweetCache(row);
    map.set(cached.tweetId, cached);
  }
  return map;
}

/**
 * Upsert a tweet into the cache.
 * Inserts if new, updates all fields if the tweet_id already exists.
 */
export async function upsertTweetCache(data: {
  tweetId: string;
  authorUsername: string;
  authorName: string;
  authorAvatar: string;
  tweetText: string;
  tweetUrl: string;
  lang: string | null;
  tweetCreatedAt: string;
  rawData: string;
}): Promise<TweetCache> {
  const now = Date.now();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO tweet_cache (tweet_id, author_username, author_name, author_avatar, tweet_text, tweet_url, lang, tweet_created_at, raw_data, fetched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tweet_id) DO UPDATE SET
       author_username = excluded.author_username,
       author_name = excluded.author_name,
       author_avatar = excluded.author_avatar,
       tweet_text = excluded.tweet_text,
       tweet_url = excluded.tweet_url,
       lang = excluded.lang,
       tweet_created_at = excluded.tweet_created_at,
       raw_data = excluded.raw_data,
       updated_at = excluded.updated_at
     RETURNING *`,
    [
      data.tweetId,
      data.authorUsername,
      data.authorName,
      data.authorAvatar,
      data.tweetText,
      data.tweetUrl,
      data.lang,
      data.tweetCreatedAt,
      data.rawData,
      now,
      now,
    ]
  );

  return rowToTweetCache(rows[0]);
}


