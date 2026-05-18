/**
 * Link operations for ScopedDB. Free functions that take userId.
 */

import { executeD1Query } from '../d1-client';
import { rowToLink } from '../mappers';
import type { Link, NewLink } from '../schema';
import type { GetLinksOptions } from './types';

export function buildLinksQuery(
  userId: string,
  options: GetLinksOptions,
): { conditions: string[]; params: unknown[]; joinClause: string; orderClause: string } {
  const { query, folderId, tagId, sortBy = 'created', sortOrder = 'desc' } = options;
  const conditions: string[] = ['l.user_id = ?'];
  const params: unknown[] = [userId];

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

export async function getLinks(userId: string, options: GetLinksOptions = {}): Promise<Link[]> {
  const { conditions, params, joinClause, orderClause } = buildLinksQuery(userId, options);
  const sql = `
    SELECT l.* FROM links l
    ${joinClause}
    WHERE ${conditions.join(' AND ')}
    ${orderClause}
  `;
  const rows = await executeD1Query<Record<string, unknown>>(sql, params);
  return rows.map(rowToLink);
}

export async function getLinksPage(
  userId: string,
  options: GetLinksOptions & { limit: number; offset: number },
): Promise<{ items: Link[]; total: number }> {
  const { limit, offset, ...filterOptions } = options;
  const { conditions, params, joinClause, orderClause } = buildLinksQuery(userId, filterOptions);
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

  const { executeD1Batch } = await import('../d1-client');
  const results = await executeD1Batch<Record<string, unknown>>([
    { sql: countSql, params: [...params] },
    { sql: selectSql, params: [...params, limit, offset] },
  ]);
  const countRows = results[0] ?? [];
  const dataRows = results[1] ?? [];
  const total = (countRows[0]?.cnt as number) ?? 0;
  return { items: dataRows.map(rowToLink), total };
}

export async function getLinkById(userId: string, id: number): Promise<Link | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM links WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  return rows[0] ? rowToLink(rows[0]) : null;
}

export async function getLinksByIds(userId: string, ids: number[]): Promise<Link[]> {
  if (ids.length === 0) return [];
  const CHUNK_SIZE = 90;
  const results: Link[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT * FROM links WHERE id IN (${placeholders}) AND user_id = ?`,
      [...chunk, userId],
    );
    results.push(...rows.map(rowToLink));
  }
  return results;
}

export async function createLink(
  userId: string,
  data: Omit<NewLink, 'id' | 'createdAt' | 'userId'>,
): Promise<Link> {
  const now = Date.now();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO links (user_id, folder_id, original_url, slug, is_custom, expires_at, clicks, note, screenshot_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [
      userId,
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

export async function deleteLink(userId: string, id: number): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'DELETE FROM links WHERE id = ? AND user_id = ? RETURNING id',
    [id, userId],
  );
  return rows.length > 0;
}

export interface UpdateLinkData {
  originalUrl?: string;
  folderId?: string | null;
  expiresAt?: Date | null;
  slug?: string;
  isCustom?: boolean;
  screenshotUrl?: string | null;
}

function buildUpdateSet(data: UpdateLinkData): { setClauses: string[]; params: unknown[] } {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (data.originalUrl !== undefined) { setClauses.push('original_url = ?'); params.push(data.originalUrl); }
  if (data.folderId !== undefined) { setClauses.push('folder_id = ?'); params.push(data.folderId ?? null); }
  if (data.expiresAt !== undefined) { setClauses.push('expires_at = ?'); params.push(data.expiresAt ? data.expiresAt.getTime() : null); }
  if (data.slug !== undefined) { setClauses.push('slug = ?'); params.push(data.slug); }
  if (data.isCustom !== undefined) { setClauses.push('is_custom = ?'); params.push(data.isCustom ? 1 : 0); }
  if (data.screenshotUrl !== undefined) { setClauses.push('screenshot_url = ?'); params.push(data.screenshotUrl); }
  return { setClauses, params };
}

export async function updateLink(
  userId: string,
  id: number,
  data: UpdateLinkData,
): Promise<Link | null> {
  const { setClauses, params } = buildUpdateSet(data);
  if (setClauses.length === 0) return getLinkById(userId, id);

  params.push(id, userId);
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE links SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
    params,
  );
  return rows[0] ? rowToLink(rows[0]) : null;
}

export interface UpdateLinkMetadataData {
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaFavicon?: string | null;
}

export async function updateLinkMetadata(
  userId: string,
  id: number,
  data: UpdateLinkMetadataData,
): Promise<Link | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (data.metaTitle !== undefined) { setClauses.push('meta_title = ?'); params.push(data.metaTitle); }
  if (data.metaDescription !== undefined) { setClauses.push('meta_description = ?'); params.push(data.metaDescription); }
  if (data.metaFavicon !== undefined) { setClauses.push('meta_favicon = ?'); params.push(data.metaFavicon); }

  if (setClauses.length === 0) return getLinkById(userId, id);
  params.push(id, userId);
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE links SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
    params,
  );
  return rows[0] ? rowToLink(rows[0]) : null;
}

export async function updateLinkScreenshot(
  userId: string,
  id: number,
  screenshotUrl: string,
): Promise<Link | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'UPDATE links SET screenshot_url = ? WHERE id = ? AND user_id = ? RETURNING *',
    [screenshotUrl, id, userId],
  );
  return rows[0] ? rowToLink(rows[0]) : null;
}

export async function updateLinkNote(
  userId: string,
  id: number,
  note: string | null,
): Promise<Link | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'UPDATE links SET note = ? WHERE id = ? AND user_id = ? RETURNING *',
    [note, id, userId],
  );
  return rows[0] ? rowToLink(rows[0]) : null;
}
