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
import type { Link, Analytics, Folder, NewLink, NewFolder, Upload, NewUpload } from './schema';

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
    data: Partial<Pick<Link, 'originalUrl' | 'folderId' | 'expiresAt'>>,
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
   */
  async getAnalyticsStats(linkId: number): Promise<{
    totalClicks: number;
    uniqueCountries: string[];
    deviceBreakdown: Record<string, number>;
    browserBreakdown: Record<string, number>;
    osBreakdown: Record<string, number>;
  }> {
    const records = await this.getAnalyticsByLinkId(linkId);

    const countries = new Set<string>();
    const devices: Record<string, number> = {};
    const browsers: Record<string, number> = {};
    const oses: Record<string, number> = {};

    for (const record of records) {
      if (record.country) countries.add(record.country);
      if (record.device)
        devices[record.device] = (devices[record.device] || 0) + 1;
      if (record.browser)
        browsers[record.browser] = (browsers[record.browser] || 0) + 1;
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

  /** Get the R2 key for an upload, only if owned by this user. Returns null if not found. */
  async getUploadKey(id: number): Promise<string | null> {
    const rows = await executeD1Query<Record<string, unknown>>(
      'SELECT key FROM uploads WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId],
    );
    return rows[0] ? (rows[0].key as string) : null;
  }
}
