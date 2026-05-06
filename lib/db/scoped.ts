/**
 * Scoped database access layer with enforced row-level security.
 *
 * All user-owned data operations MUST go through ScopedDB.
 * The userId is bound at construction time and injected into every query,
 * making it impossible to forget the ownership check.
 *
 * Public operations (e.g. slug lookup for redirects) remain as standalone
 * functions in ./index.ts — they intentionally have no user scope.
 */

import { executeD1Query, executeD1Batch, type D1Statement } from './d1-client';
import { rowToLink, rowToAnalytics, rowToFolder, rowToUpload, rowToWebhook, rowToTag, rowToLinkTag, rowToUserSettings, rowToApiKey, rowToIdea, rowToIdeaTag } from './mappers';
import type { Link, Analytics, Folder, FolderWithLinkCount, NewLink, NewFolder, Upload, NewUpload, Webhook, Tag, LinkTag, UserSettings, ApiKey, IdeaTag } from './schema';
import { generateExcerpt } from '../markdown';

// ============================================
// ScopedDB — all user-owned data operations
// ============================================

/** Sort field for links. */
export type LinkSortField = 'created' | 'clicks';

/** Sort order. */
export type SortOrder = 'asc' | 'desc';

/** Filter options for getLinks. */
export interface GetLinksOptions {
  /** Keyword search across slug, originalUrl, note, metaTitle, metaDescription */
  query?: string;
  /** Filter by folder ID. Use 'inbox' for links with no folder (folder_id IS NULL) */
  folderId?: string | 'inbox';
  /** Filter by tag ID */
  tagId?: string;
  /** Sort by field (default: created) */
  sortBy?: LinkSortField;
  /** Sort order (default: desc) */
  sortOrder?: SortOrder;
}

/** Filter options for getIdeas. */
export interface GetIdeasOptions {
  /** Keyword search across title and excerpt */
  query?: string;
  /** Filter by tag ID */
  tagId?: string;
}

/** Lightweight shape for list views and search (no full content). */
export interface IdeaListItem {
  id: number;
  title: string | null;
  excerpt: string | null;
  tagIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Full shape for detail view / edit. */
export interface IdeaDetail extends IdeaListItem {
  content: string;
}

export class ScopedDB {
  constructor(private readonly userId: string) {
    if (!userId) {
      throw new Error('ScopedDB requires a non-empty userId');
    }
  }

  // ---- Links ------------------------------------------------

  /**
   * Build WHERE/JOIN/ORDER clauses for link queries.
   * Shared by getLinks (no pagination) and getLinksPage (paginated).
   */
  private buildLinksQuery(options: GetLinksOptions): {
    conditions: string[];
    params: unknown[];
    joinClause: string;
    orderClause: string;
  } {
    const { query, folderId, tagId, sortBy = 'created', sortOrder = 'desc' } = options;

    const conditions: string[] = ['l.user_id = ?'];
    const params: unknown[] = [this.userId];

    if (query) {
      const searchPattern = `%${query}%`;
      conditions.push(`(
        l.slug LIKE ? OR
        l.original_url LIKE ? OR
        l.note LIKE ? OR
        l.meta_title LIKE ? OR
        l.meta_description LIKE ?
      )`);
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (folderId === 'inbox') {
      conditions.push('l.folder_id IS NULL');
    } else if (folderId) {
      conditions.push('l.folder_id = ?');
      params.push(folderId);
    }

    let joinClause = '';
    if (tagId) {
      joinClause = 'JOIN link_tags lt ON l.id = lt.link_id';
      conditions.push('lt.tag_id = ?');
      params.push(tagId);
    }

    const sortColumn = sortBy === 'clicks' ? 'l.clicks' : 'l.created_at';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderClause = `ORDER BY ${sortColumn} ${sortDirection}`;

    return { conditions, params, joinClause, orderClause };
  }

  /** Get all links owned by this user, with optional filters. */
  async getLinks(options: GetLinksOptions = {}): Promise<Link[]> {
    const { conditions, params, joinClause, orderClause } = this.buildLinksQuery(options);

    const sql = `
      SELECT l.* FROM links l
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      ${orderClause}
    `;

    const rows = await executeD1Query<Record<string, unknown>>(sql, params);
    return rows.map(rowToLink);
  }

  /**
   * Get a page of links with total count (DB-level pagination).
   * Uses LIMIT/OFFSET in SQL and a parallel COUNT query.
   */
  async getLinksPage(
    options: GetLinksOptions & { limit: number; offset: number },
  ): Promise<{ items: Link[]; total: number }> {
    const { limit, offset, ...filterOptions } = options;
    const { conditions, params, joinClause, orderClause } = this.buildLinksQuery(filterOptions);

    const whereClause = conditions.join(' AND ');

    const countSql = `
      SELECT COUNT(DISTINCT l.id) as cnt FROM links l
      ${joinClause}
      WHERE ${whereClause}
    `;

    const selectSql = `
      SELECT l.* FROM links l
      ${joinClause}
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const results = await executeD1Batch<Record<string, unknown>>([
      { sql: countSql, params: [...params] },
      { sql: selectSql, params: [...params, limit, offset] },
    ]);

    const countRows = results[0] ?? [];
    const dataRows = results[1] ?? [];
    const total = (countRows[0]?.cnt as number) ?? 0;
    const items = dataRows.map(rowToLink);

    return { items, total };
  }

  /** Get a single link by id, only if owned by this user. */
  async getLinkById(id: number): Promise<Link | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM links WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    return rows[0] ? rowToLink(rows[0]) : null;
  }

  /**
   * Get multiple links by IDs, only if owned by this user.
   * Automatically chunks into batches to stay within D1's parameter limit.
   */
  async getLinksByIds(ids: number[]): Promise<Link[]> {
    if (ids.length === 0) return [];

    // D1 has a ~100 parameter limit per query; chunk to stay safe.
    const CHUNK_SIZE = 90;
    const results: Link[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await executeD1Query<Record<string, unknown>>(
        `SELECT * FROM links WHERE id IN (${placeholders}) AND user_id = ?`,
        [...chunk, this.userId],
      );
      results.push(...rows.map(rowToLink));
    }

    return results;
  }

  /** Create a new link owned by this user. */
  async createLink(
    data: Omit<NewLink, 'id' | 'createdAt' | 'userId'>,
  ): Promise<Link> {
    const now = Date.now();
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO links (user_id, folder_id, original_url, slug, is_custom, expires_at, clicks, note, screenshot_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        this.userId,
        data.folderId ?? null,
        data.originalUrl,
        data.slug,
        data.isCustom ? 1 : 0,
        data.expiresAt ? data.expiresAt.getTime() : null,
        data.clicks ?? 0,
        data.note ?? null,
        data.screenshotUrl ?? null,
        now,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('INSERT RETURNING * returned no rows');
    return rowToLink(row);
  }

  /** Delete a link by id. Returns true if deleted. */
  async deleteLink(id: number): Promise<boolean> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'DELETE FROM links WHERE id = ? AND user_id = ? RETURNING id',
      [id, this.userId],
    );
    return rows.length > 0;
  }

  /** Update a link by id. Returns updated link or null if not found/not owned. */
  async updateLink(
    id: number,
    data: {
      originalUrl?: string;
      folderId?: string | null;
      expiresAt?: Date | null;
      slug?: string;
      isCustom?: boolean;
      screenshotUrl?: string | null;
    },
  ): Promise<Link | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (data.originalUrl !== undefined) {
      setClauses.push('original_url = ?');
      params.push(data.originalUrl);
    }
    if (data.folderId !== undefined) {
      setClauses.push('folder_id = ?');
      params.push(data.folderId ?? null); // Allow explicit null to clear folder
    }
    if (data.expiresAt !== undefined) {
      setClauses.push('expires_at = ?');
      params.push(data.expiresAt ? data.expiresAt.getTime() : null);
    }
    if (data.slug !== undefined) {
      setClauses.push('slug = ?');
      params.push(data.slug);
    }
    if (data.isCustom !== undefined) {
      setClauses.push('is_custom = ?');
      params.push(data.isCustom ? 1 : 0);
    }
    if (data.screenshotUrl !== undefined) {
      setClauses.push('screenshot_url = ?');
      params.push(data.screenshotUrl);
    }

    if (setClauses.length === 0) {
      return this.getLinkById(id);
    }

    params.push(id, this.userId);
    const rows = await executeD1Query<Record<string, unknown>>(
      `UPDATE links SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      params,
    );
    return rows[0] ? rowToLink(rows[0]) : null;
  }

  /** Update metadata fields for a link. Returns updated link or null if not found/not owned. */
  async updateLinkMetadata(
    id: number,
    data: { metaTitle?: string | null; metaDescription?: string | null; metaFavicon?: string | null },
  ): Promise<Link | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (data.metaTitle !== undefined) {
      setClauses.push('meta_title = ?');
      params.push(data.metaTitle);
    }
    if (data.metaDescription !== undefined) {
      setClauses.push('meta_description = ?');
      params.push(data.metaDescription);
    }
    if (data.metaFavicon !== undefined) {
      setClauses.push('meta_favicon = ?');
      params.push(data.metaFavicon);
    }

    if (setClauses.length === 0) {
      return this.getLinkById(id);
    }

    params.push(id, this.userId);
    const rows = await executeD1Query<Record<string, unknown>>(
      `UPDATE links SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      params,
    );
    return rows[0] ? rowToLink(rows[0]) : null;
  }

  /** Update the screenshot URL for a link. Returns updated link or null if not found/not owned. */
  async updateLinkScreenshot(
    id: number,
    screenshotUrl: string,
  ): Promise<Link | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'UPDATE links SET screenshot_url = ? WHERE id = ? AND user_id = ? RETURNING *',
      [screenshotUrl, id, this.userId],
    );
    return rows[0] ? rowToLink(rows[0]) : null;
  }

  // ---- Analytics (scoped through link ownership) -------------

  /**
   * Get analytics for a link, only if this user owns the link.
   * Uses a JOIN to enforce ownership at the SQL level.
   */
  async getAnalyticsByLinkId(linkId: number): Promise<Analytics[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT a.* FROM analytics a
       JOIN links l ON a.link_id = l.id
       WHERE a.link_id = ? AND l.user_id = ?
       ORDER BY a.created_at DESC`,
      [linkId, this.userId],
    );
    return rows.map(rowToAnalytics);
  }

  /**
   * Get aggregated analytics stats for a link, scoped to this user.
   * Uses SQL aggregation instead of fetching all rows.
   */
  async getAnalyticsStats(linkId: number): Promise<{
    totalClicks: number;
    uniqueCountries: string[];
    deviceBreakdown: Record<string, number>;
    browserBreakdown: Record<string, number>;
    osBreakdown: Record<string, number>;
  }> {
    // All queries enforce ownership via JOIN on links.user_id
    const ownershipJoin = 'JOIN links l ON a.link_id = l.id';
    const ownershipWhere = 'WHERE a.link_id = ? AND l.user_id = ?';
    const params = [linkId, this.userId];

    const [countRows, countryRows, deviceRows, browserRows, osRows] = await Promise.all([
      executeD1Query<Record<string, unknown>>(
        `SELECT COUNT(*) as total FROM analytics a ${ownershipJoin} ${ownershipWhere}`,
        params,
      ),
      executeD1Query<Record<string, unknown>>(
        `SELECT DISTINCT a.country FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.country IS NOT NULL`,
        params,
      ),
      executeD1Query<Record<string, unknown>>(
        `SELECT a.device, COUNT(*) as count FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.device IS NOT NULL GROUP BY a.device`,
        params,
      ),
      executeD1Query<Record<string, unknown>>(
        `SELECT a.browser, COUNT(*) as count FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.browser IS NOT NULL GROUP BY a.browser`,
        params,
      ),
      executeD1Query<Record<string, unknown>>(
        `SELECT a.os, COUNT(*) as count FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.os IS NOT NULL GROUP BY a.os`,
        params,
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

  // ---- Folders -----------------------------------------------

  /** Get all folders owned by this user. */
  async getFolders(): Promise<Folder[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC',
      [this.userId],
    );
    return rows.map(rowToFolder);
  }

  /** Get all folders with link counts via LEFT JOIN. */
  async getFoldersWithLinkCount(): Promise<FolderWithLinkCount[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT f.*, COUNT(l.id) AS link_count
       FROM folders f
       LEFT JOIN links l ON f.id = l.folder_id
       WHERE f.user_id = ?
       GROUP BY f.id
       ORDER BY f.created_at DESC`,
      [this.userId],
    );
    return rows.map((row) => ({
      ...rowToFolder(row),
      linkCount: Number(row.link_count) || 0,
    }));
  }

  /** Get a single folder by id, only if owned by this user. */
  async getFolderById(id: string): Promise<Folder | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM folders WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    return rows[0] ? rowToFolder(rows[0]) : null;
  }

  /** Create a new folder owned by this user. */
  async createFolder(
    data: Omit<NewFolder, 'id' | 'createdAt' | 'userId'>,
  ): Promise<Folder> {
    const now = Date.now();
    const id = crypto.randomUUID();
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO folders (id, user_id, name, icon, created_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
      [id, this.userId, data.name, data.icon ?? 'folder', now],
    );
    const row = rows[0];
    if (!row) throw new Error('INSERT RETURNING * returned no rows');
    return rowToFolder(row);
  }

  /** Update a folder by id. Returns updated folder or null if not found/not owned. */
  async updateFolder(
    id: string,
    data: Partial<Pick<Folder, 'name' | 'icon'>>,
  ): Promise<Folder | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      setClauses.push('name = ?');
      params.push(data.name);
    }
    if (data.icon !== undefined) {
      setClauses.push('icon = ?');
      params.push(data.icon);
    }

    if (setClauses.length === 0) {
      return this.getFolderById(id);
    }

    params.push(id, this.userId);
    const rows = await executeD1Query<Record<string, unknown>>(
      `UPDATE folders SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      params,
    );
    return rows[0] ? rowToFolder(rows[0]) : null;
  }

  /** Delete a folder by id. Returns true if deleted. */
  async deleteFolder(id: string): Promise<boolean> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'DELETE FROM folders WHERE id = ? AND user_id = ? RETURNING id',
      [id, this.userId],
    );
    return rows.length > 0;
  }

  // ---- Uploads -----------------------------------------------

  /** Get all uploads owned by this user. */
  async getUploads(): Promise<Upload[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM uploads WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [this.userId],
    );
    return rows.map(rowToUpload);
  }

  /** Record a completed upload. */
  async createUpload(
    data: Omit<NewUpload, 'id' | 'createdAt' | 'userId'>,
  ): Promise<Upload> {
    const now = Date.now();
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO uploads (user_id, key, file_name, file_type, file_size, public_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        this.userId,
        data.key,
        data.fileName,
        data.fileType,
        data.fileSize,
        data.publicUrl,
        now,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('INSERT RETURNING * returned no rows');
    return rowToUpload(row);
  }

  /** Get a single upload by id, only if owned by this user. */
  async getUploadById(id: number): Promise<Upload | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM uploads WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    return rows[0] ? rowToUpload(rows[0]) : null;
  }

  /** Delete an upload by id. Returns true if deleted. */
  async deleteUpload(id: number): Promise<boolean> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'DELETE FROM uploads WHERE id = ? AND user_id = ? RETURNING id',
      [id, this.userId],
    );
    return rows.length > 0;
  }

  // ---- Overview (global aggregates across all user data) ------

  /**
   * Get aggregated overview stats across all user-owned links, analytics, and uploads.
   * All aggregation is done at the SQL level — no raw row fetching.
   */
  async getOverviewStats(): Promise<{
    totalLinks: number;
    totalClicks: number;
    totalUploads: number;
    totalStorageBytes: number;
    clickTrend: { date: string; clicks: number; origin: number; worker: number }[];
    uploadTrend: { date: string; uploads: number }[];
    topLinks: { slug: string; originalUrl: string; clicks: number }[];
    deviceBreakdown: Record<string, number>;
    browserBreakdown: Record<string, number>;
    osBreakdown: Record<string, number>;
    fileTypeBreakdown: Record<string, number>;
  }> {
    // All aggregation via SQL — no raw row fetching
    const analyticsJoin = 'FROM analytics a JOIN links l ON a.link_id = l.id WHERE l.user_id = ?';
    const analyticsParams = [this.userId];

    const [
      linkStatsRows,
      topLinkRows,
      uploadStatsRows,
      uploadTrendRows,
      fileTypeRows,
      clickTrendRows,
      deviceRows,
      browserRows,
      osRows,
    ] = await Promise.all([
      // Link aggregates: total count + total clicks
      executeD1Query<Record<string, unknown>>(
        'SELECT COUNT(*) AS total_links, COALESCE(SUM(clicks), 0) AS total_clicks FROM links WHERE user_id = ?',
        [this.userId],
      ),
      // Top links by clicks (descending)
      executeD1Query<Record<string, unknown>>(
        'SELECT slug, original_url, clicks FROM links WHERE user_id = ? ORDER BY clicks DESC',
        [this.userId],
      ),
      // Upload aggregates: total count + total storage bytes
      executeD1Query<Record<string, unknown>>(
        'SELECT COUNT(*) AS total_uploads, COALESCE(SUM(file_size), 0) AS total_storage FROM uploads WHERE user_id = ?',
        [this.userId],
      ),
      // Upload trend: GROUP BY date in SQL
      executeD1Query<Record<string, unknown>>(
        `SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as uploads FROM uploads WHERE user_id = ? GROUP BY date ORDER BY date ASC`,
        [this.userId],
      ),
      // File type breakdown
      executeD1Query<Record<string, unknown>>(
        'SELECT file_type, COUNT(*) as count FROM uploads WHERE user_id = ? GROUP BY file_type',
        [this.userId],
      ),
      // Click trend: GROUP BY date with source breakdown
      executeD1Query<Record<string, unknown>>(
        `SELECT date(a.created_at / 1000, 'unixepoch') as date, COUNT(*) as clicks, SUM(CASE WHEN a.source = 'origin' OR a.source IS NULL THEN 1 ELSE 0 END) as origin_clicks, SUM(CASE WHEN a.source = 'worker' THEN 1 ELSE 0 END) as worker_clicks ${analyticsJoin} GROUP BY date ORDER BY date ASC`,
        analyticsParams,
      ),
      // Analytics breakdowns
      executeD1Query<Record<string, unknown>>(
        `SELECT a.device, COUNT(*) as count ${analyticsJoin} AND a.device IS NOT NULL GROUP BY a.device`,
        analyticsParams,
      ),
      executeD1Query<Record<string, unknown>>(
        `SELECT a.browser, COUNT(*) as count ${analyticsJoin} AND a.browser IS NOT NULL GROUP BY a.browser`,
        analyticsParams,
      ),
      executeD1Query<Record<string, unknown>>(
        `SELECT a.os, COUNT(*) as count ${analyticsJoin} AND a.os IS NOT NULL GROUP BY a.os`,
        analyticsParams,
      ),
    ]);

    // Link stats
    const totalLinks = (linkStatsRows[0]?.total_links as number) ?? 0;
    const totalClicks = (linkStatsRows[0]?.total_clicks as number) ?? 0;

    // Top links
    const topLinks = topLinkRows.map(r => ({
      slug: r.slug as string,
      originalUrl: r.original_url as string,
      clicks: (r.clicks as number) ?? 0,
    }));

    // Upload stats
    const totalUploads = (uploadStatsRows[0]?.total_uploads as number) ?? 0;
    const totalStorageBytes = (uploadStatsRows[0]?.total_storage as number) ?? 0;

    // Upload trend
    const uploadTrend = uploadTrendRows.map(r => ({
      date: r.date as string,
      uploads: r.uploads as number,
    }));

    // File type breakdown
    const fileTypeBreakdown: Record<string, number> = {};
    for (const r of fileTypeRows) fileTypeBreakdown[r.file_type as string] = r.count as number;

    // Click trend
    const clickTrend = clickTrendRows.map(r => ({
      date: r.date as string,
      clicks: r.clicks as number,
      origin: (r.origin_clicks as number) ?? 0,
      worker: (r.worker_clicks as number) ?? 0,
    }));

    // Analytics breakdowns
    const deviceBreakdown: Record<string, number> = {};
    for (const r of deviceRows) deviceBreakdown[r.device as string] = r.count as number;

    const browserBreakdown: Record<string, number> = {};
    for (const r of browserRows) browserBreakdown[r.browser as string] = r.count as number;

    const osBreakdown: Record<string, number> = {};
    for (const r of osRows) osBreakdown[r.os as string] = r.count as number;

    return {
      totalLinks,
      totalClicks,
      totalUploads,
      totalStorageBytes,
      clickTrend,
      uploadTrend,
      topLinks,
      deviceBreakdown,
      browserBreakdown,
      osBreakdown,
      fileTypeBreakdown,
    };
  }

  /** Get the R2 key for an upload, only if owned by this user. Returns null if not found. */
  async getUploadKey(id: number): Promise<string | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT key FROM uploads WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    return rows[0] ? (rows[0].key as string) : null;
  }

  // ============================================
  // Webhook Operations (one per user)
  // ============================================

  /** Get the current webhook for this user, or null. */
  async getWebhook(): Promise<Webhook | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM webhooks WHERE user_id = ? LIMIT 1',
      [this.userId],
    );
    return rows[0] ? rowToWebhook(rows[0]) : null;
  }

  /** Upsert a webhook token for this user (replaces existing). */
  async upsertWebhook(token: string): Promise<Webhook> {
    const now = Date.now();
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO webhooks (user_id, token, rate_limit, created_at) VALUES (?, ?, 5, ?)
       ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at
       RETURNING *`,
      [this.userId, token, now],
    );
    const row = rows[0];
    if (!row) throw new Error('UPSERT RETURNING * returned no rows');
    return rowToWebhook(row);
  }

  /** Update the rate limit for this user's webhook. */
  async updateWebhookRateLimit(rateLimit: number): Promise<Webhook | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'UPDATE webhooks SET rate_limit = ? WHERE user_id = ? RETURNING *',
      [rateLimit, this.userId],
    );
    return rows[0] ? rowToWebhook(rows[0]) : null;
  }

  /** Delete the webhook for this user. Returns true if deleted. */
  async deleteWebhook(): Promise<boolean> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'DELETE FROM webhooks WHERE user_id = ? RETURNING id',
      [this.userId],
    );
    return rows.length > 0;
  }

  // ---- Tags -------------------------------------------------

  /** Get all tags owned by this user. */
  async getTags(): Promise<Tag[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM tags WHERE user_id = ? ORDER BY created_at DESC',
      [this.userId],
    );
    return rows.map(rowToTag);
  }

  /** Get a single tag by id, only if owned by this user. */
  async getTagById(id: string): Promise<Tag | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM tags WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    return rows[0] ? rowToTag(rows[0]) : null;
  }

  /** Create a new tag owned by this user. */
  async createTag(data: { name: string; color: string }): Promise<Tag> {
    const now = Date.now();
    const id = crypto.randomUUID();
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO tags (id, user_id, name, color, created_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
      [id, this.userId, data.name, data.color, now],
    );
    const row = rows[0];
    if (!row) throw new Error('INSERT RETURNING * returned no rows');
    return rowToTag(row);
  }

  /** Update a tag by id. Returns updated tag or null if not found/not owned. */
  async updateTag(
    id: string,
    data: Partial<Pick<Tag, 'name' | 'color'>>,
  ): Promise<Tag | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      setClauses.push('name = ?');
      params.push(data.name);
    }
    if (data.color !== undefined) {
      setClauses.push('color = ?');
      params.push(data.color);
    }

    if (setClauses.length === 0) {
      const rows = await executeD1Query<Record<string, unknown>>(
        'SELECT * FROM tags WHERE id = ? AND user_id = ? LIMIT 1',
        [id, this.userId],
      );
      return rows[0] ? rowToTag(rows[0]) : null;
    }

    params.push(id, this.userId);
    const rows = await executeD1Query<Record<string, unknown>>(
      `UPDATE tags SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      params,
    );
    return rows[0] ? rowToTag(rows[0]) : null;
  }

  /** Delete a tag by id. Returns true if deleted. Cascade removes link_tags entries. */
  async deleteTag(id: string): Promise<boolean> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'DELETE FROM tags WHERE id = ? AND user_id = ? RETURNING id',
      [id, this.userId],
    );
    return rows.length > 0;
  }

  // ---- Link-Tag associations --------------------------------

  /** Get all link-tag associations for this user's links. */
  async getLinkTags(): Promise<LinkTag[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT lt.* FROM link_tags lt
       JOIN links l ON lt.link_id = l.id
       WHERE l.user_id = ?`,
      [this.userId],
    );
    return rows.map(rowToLinkTag);
  }

  /** Get all tags associated with a specific link. */
  async getTagsForLink(linkId: number): Promise<Tag[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT t.* FROM tags t
       JOIN link_tags lt ON t.id = lt.tag_id
       JOIN links l ON lt.link_id = l.id
       WHERE lt.link_id = ? AND l.user_id = ?`,
      [linkId, this.userId],
    );
    return rows.map(rowToTag);
  }

  /** Add a tag to a link (only if both are owned by this user). */
  async addTagToLink(linkId: number, tagId: string): Promise<boolean> {
    // Verify ownership of both link and tag
    const [linkRows, tagRows] = await Promise.all([
      executeD1Query<Record<string, unknown>>(
        'SELECT id FROM links WHERE id = ? AND user_id = ? LIMIT 1',
        [linkId, this.userId],
      ),
      executeD1Query<Record<string, unknown>>(
        'SELECT id FROM tags WHERE id = ? AND user_id = ? LIMIT 1',
        [tagId, this.userId],
      ),
    ]);

    if (linkRows.length === 0 || tagRows.length === 0) return false;

    await executeD1Query(
      'INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)',
      [linkId, tagId],
    );
    return true;
  }

  /** Remove a tag from a link. */
  async removeTagFromLink(linkId: number, tagId: string): Promise<boolean> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `DELETE FROM link_tags
       WHERE link_id = ? AND tag_id = ?
       AND link_id IN (SELECT id FROM links WHERE user_id = ?)
       RETURNING link_id`,
      [linkId, tagId, this.userId],
    );
    return rows.length > 0;
  }

  /** Update the note for a link. Returns updated link or null. */
  async updateLinkNote(id: number, note: string | null): Promise<Link | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'UPDATE links SET note = ? WHERE id = ? AND user_id = ? RETURNING *',
      [note, id, this.userId],
    );
    return rows[0] ? rowToLink(rows[0]) : null;
  }

  // ---- User Settings ----------------------------------------

  /** Get user settings, or null if no row exists yet. */
  async getUserSettings(): Promise<UserSettings | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM user_settings WHERE user_id = ? LIMIT 1',
      [this.userId],
    );
    return rows[0] ? rowToUserSettings(rows[0]) : null;
  }

  /** Insert or update the preview style setting. Returns the upserted row. */
  async upsertPreviewStyle(previewStyle: string): Promise<UserSettings> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO user_settings (user_id, preview_style)
       VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET preview_style = excluded.preview_style
       RETURNING *`,
      [this.userId, previewStyle],
    );
    const row = rows[0];
    if (!row) throw new Error('UPSERT RETURNING * returned no rows');
    return rowToUserSettings(row);
  }

  // ---- Backy remote backup ----------------------------------

  /** Get Backy config (webhook URL + API key) for this user, or null if not configured. */
  async getBackySettings(): Promise<{ webhookUrl: string; apiKey: string } | null> {
    const settings = await this.getUserSettings();
    if (!settings?.backyWebhookUrl || !settings?.backyApiKey) return null;
    return { webhookUrl: settings.backyWebhookUrl, apiKey: settings.backyApiKey };
  }

  /** Save Backy config (webhook URL and/or API key). Creates user_settings row if needed. */
  async upsertBackySettings(data: { webhookUrl: string; apiKey: string }): Promise<UserSettings> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO user_settings (user_id, preview_style, backy_webhook_url, backy_api_key)
       VALUES (?, 'favicon', ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET backy_webhook_url = excluded.backy_webhook_url, backy_api_key = excluded.backy_api_key
       RETURNING *`,
      [this.userId, data.webhookUrl, data.apiKey],
    );
    const row = rows[0];
    if (!row) throw new Error('UPSERT RETURNING * returned no rows');
    return rowToUserSettings(row);
  }

  // ---- xray API settings ------------------------------------

  /** Get xray API config (URL + token) for this user, or null if not configured. */
  async getXraySettings(): Promise<{ apiUrl: string; apiToken: string } | null> {
    const settings = await this.getUserSettings();
    if (!settings?.xrayApiUrl || !settings?.xrayApiToken) return null;
    return { apiUrl: settings.xrayApiUrl, apiToken: settings.xrayApiToken };
  }

  /** Save xray API config (URL and token). Creates user_settings row if needed. */
  async upsertXraySettings(data: { apiUrl: string; apiToken: string }): Promise<UserSettings> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO user_settings (user_id, preview_style, xray_api_url, xray_api_token)
       VALUES (?, 'favicon', ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET xray_api_url = excluded.xray_api_url, xray_api_token = excluded.xray_api_token
       RETURNING *`,
      [this.userId, data.apiUrl, data.apiToken],
    );
    const row = rows[0];
    if (!row) throw new Error('UPSERT RETURNING * returned no rows');
    return rowToUserSettings(row);
  }

  // ---- Backy pull webhook ------------------------------------

  /** Get Backy pull webhook key for this user, or null if not configured. */
  async getBackyPullWebhook(): Promise<{ key: string } | null> {
    const settings = await this.getUserSettings();
    if (!settings?.backyPullKey) return null;
    return { key: settings.backyPullKey };
  }

  /** Save Backy pull webhook key. Creates user_settings row if needed. */
  async upsertBackyPullWebhook(data: { key: string }): Promise<UserSettings> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO user_settings (user_id, preview_style, backy_pull_key)
       VALUES (?, 'favicon', ?)
       ON CONFLICT (user_id) DO UPDATE SET backy_pull_key = excluded.backy_pull_key
       RETURNING *`,
      [this.userId, data.key],
    );
    const row = rows[0];
    if (!row) throw new Error('UPSERT RETURNING * returned no rows');
    return rowToUserSettings(row);
  }

  /** Clear Backy pull webhook key. */
  async deleteBackyPullWebhook(): Promise<UserSettings | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `UPDATE user_settings SET backy_pull_key = NULL WHERE user_id = ? RETURNING *`,
      [this.userId],
    );
    return rows[0] ? rowToUserSettings(rows[0]) : null;
  }

  // ---- API Keys ------------------------------------------------

  /** Get all API keys for this user (excluding revoked). */
  async getApiKeys(): Promise<ApiKey[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT * FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
      [this.userId],
    );
    return rows.map(rowToApiKey);
  }

  /** Create a new API key. */
  async createApiKey(data: {
    id: string;
    prefix: string;
    keyHash: string;
    name: string;
    scopes: string;
  }): Promise<ApiKey> {
    const now = Math.floor(Date.now() / 1000);
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO api_keys (id, prefix, key_hash, user_id, name, scopes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [data.id, data.prefix, data.keyHash, this.userId, data.name, data.scopes, now],
    );
    const row = rows[0];
    if (!row) throw new Error('INSERT RETURNING * returned no rows');
    return rowToApiKey(row);
  }

  /** Revoke an API key (soft delete). Only revokes keys owned by this user. */
  async revokeApiKey(id: string): Promise<ApiKey | null> {
    const now = Math.floor(Date.now() / 1000);
    const rows = await executeD1Query<Record<string, unknown>>(
      `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL RETURNING *`,
      [now, id, this.userId],
    );
    return rows[0] ? rowToApiKey(rows[0]) : null;
  }

  /** Update last_used_at timestamp for an API key. */
  async updateApiKeyLastUsed(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await executeD1Query(
      `UPDATE api_keys SET last_used_at = ? WHERE id = ?`,
      [now, id],
    );
  }

  // ---- Ideas ------------------------------------------------

  /**
   * Build WHERE/JOIN clauses for idea queries.
   * Shared by getIdeas (no pagination) and getIdeasPage (paginated).
   */
  private buildIdeasQuery(options: GetIdeasOptions): {
    conditions: string[];
    params: unknown[];
    joinClause: string;
  } {
    const { query, tagId } = options;

    const conditions: string[] = ['i.user_id = ?'];
    const params: unknown[] = [this.userId];

    if (query) {
      const searchPattern = `%${query}%`;
      conditions.push(`(i.title LIKE ? OR i.excerpt LIKE ?)`);
      params.push(searchPattern, searchPattern);
    }

    let joinClause = '';
    if (tagId) {
      joinClause = 'JOIN idea_tags it ON i.id = it.idea_id';
      conditions.push('it.tag_id = ?');
      params.push(tagId);
    }

    return { conditions, params, joinClause };
  }

  /**
   * Get all ideas owned by this user, with optional filters.
   * Returns lightweight IdeaListItem (no full content).
   */
  async getIdeas(options: GetIdeasOptions = {}): Promise<IdeaListItem[]> {
    const { conditions, params, joinClause } = this.buildIdeasQuery(options);

    const sql = `
      SELECT i.id, i.title, i.excerpt, i.created_at, i.updated_at
      FROM ideas i
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.created_at DESC
    `;

    const rows = await executeD1Query<Record<string, unknown>>(sql, params);
    const ideaIds = rows.map(r => r.id as number);

    // Fetch tag associations for these ideas
    const tagMap = await this.getIdeaTagMap(ideaIds);

    return rows.map(row => ({
      id: row.id as number,
      title: (row.title as string) ?? null,
      excerpt: (row.excerpt as string) ?? null,
      tagIds: tagMap.get(row.id as number) ?? [],
      createdAt: new Date(row.created_at as number),
      updatedAt: new Date(row.updated_at as number),
    }));
  }

  /**
   * Get a page of ideas with total count (DB-level pagination).
   * Uses LIMIT/OFFSET in SQL and a parallel COUNT query.
   */
  async getIdeasPage(
    options: GetIdeasOptions & { limit: number; offset: number },
  ): Promise<{ items: IdeaListItem[]; total: number }> {
    const { limit, offset, ...filterOptions } = options;
    const { conditions, params, joinClause } = this.buildIdeasQuery(filterOptions);

    const whereClause = conditions.join(' AND ');

    const countSql = `
      SELECT COUNT(DISTINCT i.id) as cnt FROM ideas i
      ${joinClause}
      WHERE ${whereClause}
    `;

    const selectSql = `
      SELECT i.id, i.title, i.excerpt, i.created_at, i.updated_at
      FROM ideas i
      ${joinClause}
      WHERE ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const results = await executeD1Batch<Record<string, unknown>>([
      { sql: countSql, params: [...params] },
      { sql: selectSql, params: [...params, limit, offset] },
    ]);

    const countRows = results[0] ?? [];
    const dataRows = results[1] ?? [];
    const total = (countRows[0]?.cnt as number) ?? 0;
    const ideaIds = dataRows.map(r => r.id as number);

    // Fetch tag associations for the paginated subset
    const tagMap = await this.getIdeaTagMap(ideaIds);

    const items: IdeaListItem[] = dataRows.map(row => ({
      id: row.id as number,
      title: (row.title as string) ?? null,
      excerpt: (row.excerpt as string) ?? null,
      tagIds: tagMap.get(row.id as number) ?? [],
      createdAt: new Date(row.created_at as number),
      updatedAt: new Date(row.updated_at as number),
    }));

    return { items, total };
  }

  /** Get a single idea by id, only if owned by this user. Returns full detail shape. */
  async getIdeaById(id: number): Promise<IdeaDetail | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM ideas WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    if (!rows[0]) return null;

    const idea = rowToIdea(rows[0]);
    const tagMap = await this.getIdeaTagMap([id]);

    return {
      id: idea.id,
      title: idea.title,
      excerpt: idea.excerpt,
      content: idea.content,
      tagIds: tagMap.get(id) ?? [],
      createdAt: idea.createdAt,
      updatedAt: idea.updatedAt,
    };
  }

  /**
   * Create a new idea with tag binding.
   * Validates tagIds belong to user, then inserts idea and binds tags.
   *
   * Note: D1 batch() cannot share variables across statements (last_insert_rowid()
   * returns the most recent INSERT across ALL statements). So we:
   * 1. Insert the idea and get its ID via RETURNING
   * 2. Batch-insert tag bindings with the concrete ID
   * 3. If step 2 fails, delete the idea (compensating transaction)
   */
  async createIdea(data: {
    content: string;
    title?: string;
    tagIds?: string[];
  }): Promise<IdeaDetail> {
    const now = Date.now();
    const excerpt = generateExcerpt(data.content, 200);
    const tagIds = data.tagIds ?? [];

    // Step 1: Pre-validate tagIds belong to user (fail-fast before any mutation)
    if (tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(', ');
      const validTags = await executeD1Query<{ id: string }>(
        `SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`,
        [this.userId, ...tagIds],
      );
      if (validTags.length !== tagIds.length) {
        const validIds = new Set(validTags.map(t => t.id));
        const invalid = tagIds.filter(id => !validIds.has(id));
        throw new Error(`Invalid tag IDs: ${invalid.join(', ')}`);
      }
    }

    // Step 2: Insert idea to get its concrete ID
    const [ideaRow] = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO ideas (user_id, title, content, excerpt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [this.userId, data.title ?? null, data.content, excerpt, now, now],
    );
    if (!ideaRow) {
      throw new Error('Failed to create idea');
    }
    const idea = rowToIdea(ideaRow);

    // Step 3: Batch-insert tag bindings with explicit idea ID
    if (tagIds.length > 0) {
      try {
        const tagStatements: D1Statement[] = tagIds.map((tagId) => ({
          sql: `INSERT INTO idea_tags (idea_id, tag_id) VALUES (?, ?)`,
          params: [idea.id, tagId],
        }));
        await executeD1Batch(tagStatements);
      } catch (err) {
        // Compensating transaction: delete the idea if tag binding fails
        console.error('createIdea: tag binding failed, rolling back idea', err);
        await executeD1Query('DELETE FROM ideas WHERE id = ?', [idea.id]);
        throw err;
      }
    }

    return {
      id: idea.id,
      title: idea.title,
      excerpt: idea.excerpt,
      content: idea.content,
      tagIds,
      createdAt: idea.createdAt,
      updatedAt: idea.updatedAt,
    };
  }

  /**
   * Update an idea with atomic tag sync.
   * Updates updated_at when any of title, content, or tags change.
   */
  async updateIdea(
    id: number,
    data: {
      title?: string | null;
      content?: string;
      tagIds?: string[];
    },
  ): Promise<IdeaDetail | null> {
    // Verify ownership first
    const existing = await this.getIdeaById(id);
    if (!existing) return null;

    const now = Date.now();
    const tagIds = data.tagIds;

    // Step 1: Pre-validate tagIds if provided
    if (tagIds && tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(', ');
      const validTags = await executeD1Query<{ id: string }>(
        `SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`,
        [this.userId, ...tagIds],
      );
      if (validTags.length !== tagIds.length) {
        const validIds = new Set(validTags.map(t => t.id));
        const invalid = tagIds.filter(tid => !validIds.has(tid));
        throw new Error(`Invalid tag IDs: ${invalid.join(', ')}`);
      }
    }

    // Step 2: Build update statements
    const statements: D1Statement[] = [];

    // Build SET clause for idea update
    const setClauses: string[] = ['updated_at = ?'];
    const setParams: unknown[] = [now];

    if (data.title !== undefined) {
      setClauses.push('title = ?');
      setParams.push(data.title);
    }
    if (data.content !== undefined) {
      setClauses.push('content = ?');
      setParams.push(data.content);
      // Regenerate excerpt when content changes
      setClauses.push('excerpt = ?');
      setParams.push(generateExcerpt(data.content, 200));
    }

    statements.push({
      sql: `UPDATE ideas SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      params: [...setParams, id, this.userId],
    });

    // If tagIds provided, sync tags: delete all existing, then insert new
    if (tagIds !== undefined) {
      statements.push({
        sql: 'DELETE FROM idea_tags WHERE idea_id = ?',
        params: [id],
      });
      for (const tagId of tagIds) {
        statements.push({
          sql: 'INSERT INTO idea_tags (idea_id, tag_id) VALUES (?, ?)',
          params: [id, tagId],
        });
      }
    }

    // Step 3: Single atomic batch
    const results = await executeD1Batch<Record<string, unknown>>(statements);

    const ideaRow = results[0]?.[0];
    if (!ideaRow) return null;

    const idea = rowToIdea(ideaRow);
    return {
      id: idea.id,
      title: idea.title,
      excerpt: idea.excerpt,
      content: idea.content,
      tagIds: tagIds ?? existing.tagIds,
      createdAt: idea.createdAt,
      updatedAt: idea.updatedAt,
    };
  }

  /** Delete an idea by id. Returns true if deleted. Cascade deletes idea_tags. */
  async deleteIdea(id: number): Promise<boolean> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'DELETE FROM ideas WHERE id = ? AND user_id = ? RETURNING id',
      [id, this.userId],
    );
    return rows.length > 0;
  }

  /** Get all idea-tag associations for this user's ideas. */
  async getIdeaTags(): Promise<IdeaTag[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT it.* FROM idea_tags it
       JOIN ideas i ON it.idea_id = i.id
       WHERE i.user_id = ?`,
      [this.userId],
    );
    return rows.map(rowToIdeaTag);
  }

  /** Helper: Get a map of idea_id → tagIds[] for efficient list population. */
  private async getIdeaTagMap(ideaIds: number[]): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    if (ideaIds.length === 0) return map;

    const placeholders = ideaIds.map(() => '?').join(', ');
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT idea_id, tag_id FROM idea_tags WHERE idea_id IN (${placeholders})`,
      ideaIds,
    );

    for (const row of rows) {
      const ideaId = row.idea_id as number;
      const tagId = row.tag_id as string;
      const existing = map.get(ideaId);
      if (existing) {
        existing.push(tagId);
      } else {
        map.set(ideaId, [tagId]);
      }
    }

    return map;
  }

}
