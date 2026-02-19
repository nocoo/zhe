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

import { executeD1Query } from './d1-client';
import type { Link, Analytics, Folder, NewLink, NewFolder, Upload, NewUpload, Webhook, Tag, LinkTag, UserSettings } from './schema';

// ============================================
// Row conversion helpers (shared with index.ts)
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

function rowToFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    icon: (row.icon as string) || 'folder',
    createdAt: new Date(row.created_at as number),
  };
}

function rowToUpload(row: Record<string, unknown>): Upload {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    key: row.key as string,
    fileName: row.file_name as string,
    fileType: row.file_type as string,
    fileSize: row.file_size as number,
    publicUrl: row.public_url as string,
    createdAt: new Date(row.created_at as number),
  };
}

function rowToWebhook(row: Record<string, unknown>): Webhook {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    token: row.token as string,
    rateLimit: (row.rate_limit as number) ?? 5,
    createdAt: new Date(row.created_at as number),
  };
}

function rowToTag(row: Record<string, unknown>): Tag {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: new Date(row.created_at as number),
  };
}

function rowToLinkTag(row: Record<string, unknown>): LinkTag {
  return {
    linkId: row.link_id as number,
    tagId: row.tag_id as string,
  };
}

function rowToUserSettings(row: Record<string, unknown>): UserSettings {
  return {
    userId: row.user_id as string,
    previewStyle: row.preview_style as string,
  };
}

// ============================================
// ScopedDB — all user-owned data operations
// ============================================

export class ScopedDB {
  constructor(private readonly userId: string) {
    if (!userId) {
      throw new Error('ScopedDB requires a non-empty userId');
    }
  }

  // ---- Links ------------------------------------------------

  /** Get all links owned by this user. */
  async getLinks(): Promise<Link[]> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC',
      [this.userId],
    );
    return rows.map(rowToLink);
  }

  /** Get a single link by id, only if owned by this user. */
  async getLinkById(id: number): Promise<Link | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT * FROM links WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    return rows[0] ? rowToLink(rows[0]) : null;
  }

  /** Create a new link owned by this user. */
  async createLink(
    data: Omit<NewLink, 'id' | 'createdAt' | 'userId'>,
  ): Promise<Link> {
    const now = Date.now();
    const rows = await executeD1Query<Record<string, unknown>>(
      `INSERT INTO links (user_id, folder_id, original_url, slug, is_custom, expires_at, clicks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        this.userId,
        data.folderId ?? null,
        data.originalUrl,
        data.slug,
        data.isCustom ? 1 : 0,
        data.expiresAt ? data.expiresAt.getTime() : null,
        data.clicks ?? 0,
        now,
      ],
    );
    return rowToLink(rows[0]);
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
    data: Partial<Pick<Link, 'originalUrl' | 'folderId' | 'expiresAt' | 'slug' | 'isCustom' | 'screenshotUrl'>>,
  ): Promise<Link | null> {
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
    return rowToFolder(rows[0]);
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
    return rowToUpload(rows[0]);
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
   * Returns counts, breakdowns, click timestamps (for trend building), and top links.
   */
  async getOverviewStats(): Promise<{
    totalLinks: number;
    totalClicks: number;
    totalUploads: number;
    totalStorageBytes: number;
    clickTimestamps: Date[];
    uploadTimestamps: Date[];
    topLinks: { slug: string; originalUrl: string; clicks: number }[];
    deviceBreakdown: Record<string, number>;
    browserBreakdown: Record<string, number>;
    osBreakdown: Record<string, number>;
    fileTypeBreakdown: Record<string, number>;
  }> {
    // Fetch all user data in parallel
    const [links, uploads] = await Promise.all([
      this.getLinks(),
      this.getUploads(),
    ]);

    // Aggregate link stats
    const totalLinks = links.length;
    const totalClicks = links.reduce((sum, l) => sum + (l.clicks ?? 0), 0);

    // Top links sorted by clicks descending
    const topLinks = [...links]
      .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0))
      .map(l => ({ slug: l.slug, originalUrl: l.originalUrl, clicks: l.clicks ?? 0 }));

    // Upload stats
    const totalUploads = uploads.length;
    const totalStorageBytes = uploads.reduce((sum, u) => sum + u.fileSize, 0);
    const uploadTimestamps = uploads.map(u => u.createdAt);

    // File type breakdown
    const fileTypes: Record<string, number> = {};
    for (const upload of uploads) {
      fileTypes[upload.fileType] = (fileTypes[upload.fileType] || 0) + 1;
    }

    // Fetch all analytics for the user in a single query (avoids N+1)
    const analyticsRows = await executeD1Query<Record<string, unknown>>(
      `SELECT a.* FROM analytics a
       JOIN links l ON a.link_id = l.id
       WHERE l.user_id = ?
       ORDER BY a.created_at DESC`,
      [this.userId],
    );
    const allAnalytics = analyticsRows.map(rowToAnalytics);

    const clickTimestamps = allAnalytics.map(a => a.createdAt);

    const devices: Record<string, number> = {};
    const browsers: Record<string, number> = {};
    const oses: Record<string, number> = {};

    for (const record of allAnalytics) {
      if (record.device) devices[record.device] = (devices[record.device] || 0) + 1;
      if (record.browser) browsers[record.browser] = (browsers[record.browser] || 0) + 1;
      if (record.os) oses[record.os] = (oses[record.os] || 0) + 1;
    }

    return {
      totalLinks,
      totalClicks,
      totalUploads,
      totalStorageBytes,
      clickTimestamps,
      uploadTimestamps,
      topLinks,
      deviceBreakdown: devices,
      browserBreakdown: browsers,
      osBreakdown: oses,
      fileTypeBreakdown: fileTypes,
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
    return rowToWebhook(rows[0]);
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
    return rowToTag(rows[0]);
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
    return rowToUserSettings(rows[0]);
  }
}
