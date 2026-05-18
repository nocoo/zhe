/**
 * Folder operations for ScopedDB.
 */

import { executeD1Query } from '../d1-client';
import { rowToFolder } from '../mappers';
import type { Folder, FolderWithLinkCount, NewFolder } from '../schema';

export async function getFolders(userId: string): Promise<Folder[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  return rows.map(rowToFolder);
}

export async function getFoldersWithLinkCount(userId: string): Promise<FolderWithLinkCount[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT f.*, COUNT(l.id) AS link_count
     FROM folders f
     LEFT JOIN links l ON f.id = l.folder_id
     WHERE f.user_id = ?
     GROUP BY f.id
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    ...rowToFolder(row),
    linkCount: Number(row.link_count) || 0,
  }));
}

export async function getFolderById(userId: string, id: string): Promise<Folder | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM folders WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  return rows[0] ? rowToFolder(rows[0]) : null;
}

export async function createFolder(
  userId: string,
  data: Omit<NewFolder, 'id' | 'createdAt' | 'userId'>,
): Promise<Folder> {
  const now = Date.now();
  const id = crypto.randomUUID();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO folders (id, user_id, name, icon, created_at)
     VALUES (?, ?, ?, ?, ?)
     RETURNING *`,
    [id, userId, data.name, data.icon ?? 'folder', now],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT RETURNING * returned no rows');
  return rowToFolder(row);
}

export async function updateFolder(
  userId: string,
  id: string,
  data: Partial<Pick<Folder, 'name' | 'icon'>>,
): Promise<Folder | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) { setClauses.push('name = ?'); params.push(data.name); }
  if (data.icon !== undefined) { setClauses.push('icon = ?'); params.push(data.icon); }

  if (setClauses.length === 0) return getFolderById(userId, id);

  params.push(id, userId);
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE folders SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
    params,
  );
  return rows[0] ? rowToFolder(rows[0]) : null;
}

export async function deleteFolder(userId: string, id: string): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'DELETE FROM folders WHERE id = ? AND user_id = ? RETURNING id',
    [id, userId],
  );
  return rows.length > 0;
}
