/**
 * Tag and link-tag operations for ScopedDB.
 */

import { executeD1Query } from '../d1-client';
import { rowToTag, rowToLinkTag } from '../mappers';
import type { Tag, LinkTag } from '../schema';

export async function getTags(userId: string): Promise<Tag[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM tags WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  return rows.map(rowToTag);
}

export async function getTagById(userId: string, id: string): Promise<Tag | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM tags WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  return rows[0] ? rowToTag(rows[0]) : null;
}

export async function createTag(
  userId: string,
  data: { name: string; color: string },
): Promise<Tag> {
  const now = Date.now();
  const id = crypto.randomUUID();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO tags (id, user_id, name, color, created_at)
     VALUES (?, ?, ?, ?, ?)
     RETURNING *`,
    [id, userId, data.name, data.color, now],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT RETURNING * returned no rows');
  return rowToTag(row);
}

export async function updateTag(
  userId: string,
  id: string,
  data: Partial<Pick<Tag, 'name' | 'color'>>,
): Promise<Tag | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) { setClauses.push('name = ?'); params.push(data.name); }
  if (data.color !== undefined) { setClauses.push('color = ?'); params.push(data.color); }

  if (setClauses.length === 0) return getTagById(userId, id);

  params.push(id, userId);
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE tags SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
    params,
  );
  return rows[0] ? rowToTag(rows[0]) : null;
}

export async function deleteTag(userId: string, id: string): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'DELETE FROM tags WHERE id = ? AND user_id = ? RETURNING id',
    [id, userId],
  );
  return rows.length > 0;
}

export async function getLinkTags(userId: string): Promise<LinkTag[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT lt.* FROM link_tags lt
     JOIN links l ON lt.link_id = l.id
     WHERE l.user_id = ?`,
    [userId],
  );
  return rows.map(rowToLinkTag);
}

export async function getTagsForLink(userId: string, linkId: number): Promise<Tag[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT t.* FROM tags t
     JOIN link_tags lt ON t.id = lt.tag_id
     JOIN links l ON lt.link_id = l.id
     WHERE lt.link_id = ? AND l.user_id = ?`,
    [linkId, userId],
  );
  return rows.map(rowToTag);
}

export async function getTagsForLinks(
  userId: string,
  linkIds: number[],
): Promise<Map<number, Tag[]>> {
  const map = new Map<number, Tag[]>();
  if (linkIds.length === 0) return map;

  const CHUNK_SIZE = 90;
  for (let i = 0; i < linkIds.length; i += CHUNK_SIZE) {
    const chunk = linkIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await executeD1Query<Record<string, unknown>>(
      `SELECT lt.link_id AS link_id, t.*
       FROM tags t
       JOIN link_tags lt ON t.id = lt.tag_id
       JOIN links l ON lt.link_id = l.id
       WHERE lt.link_id IN (${placeholders}) AND l.user_id = ?`,
      [...chunk, userId],
    );
    for (const row of rows) {
      const linkId = row.link_id as number;
      const tag = rowToTag(row);
      const existing = map.get(linkId);
      if (existing) existing.push(tag);
      else map.set(linkId, [tag]);
    }
  }
  return map;
}

export async function addTagToLink(
  userId: string,
  linkId: number,
  tagId: string,
): Promise<boolean> {
  const [linkRows, tagRows] = await Promise.all([
    executeD1Query<Record<string, unknown>>(
      'SELECT id FROM links WHERE id = ? AND user_id = ? LIMIT 1',
      [linkId, userId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT id FROM tags WHERE id = ? AND user_id = ? LIMIT 1',
      [tagId, userId],
    ),
  ]);

  if (linkRows.length === 0 || tagRows.length === 0) return false;

  await executeD1Query(
    'INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)',
    [linkId, tagId],
  );
  return true;
}

export async function removeTagFromLink(
  userId: string,
  linkId: number,
  tagId: string,
): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `DELETE FROM link_tags
     WHERE link_id = ? AND tag_id = ?
     AND link_id IN (SELECT id FROM links WHERE user_id = ?)
     RETURNING link_id`,
    [linkId, tagId, userId],
  );
  return rows.length > 0;
}
