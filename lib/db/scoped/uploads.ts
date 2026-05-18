/**
 * Upload operations for ScopedDB.
 */

import { executeD1Query } from '../d1-client';
import { rowToUpload } from '../mappers';
import type { Upload, NewUpload } from '../schema';

export async function getUploads(userId: string): Promise<Upload[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM uploads WHERE user_id = ? ORDER BY created_at DESC, id DESC',
    [userId],
  );
  return rows.map(rowToUpload);
}

export async function createUpload(
  userId: string,
  data: Omit<NewUpload, 'id' | 'createdAt' | 'userId'>,
): Promise<Upload> {
  const now = Date.now();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO uploads (user_id, key, file_name, file_type, file_size, public_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [userId, data.key, data.fileName, data.fileType, data.fileSize, data.publicUrl, now],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT RETURNING * returned no rows');
  return rowToUpload(row);
}

export async function getUploadById(userId: string, id: number): Promise<Upload | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM uploads WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  return rows[0] ? rowToUpload(rows[0]) : null;
}

export async function deleteUpload(userId: string, id: number): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'DELETE FROM uploads WHERE id = ? AND user_id = ? RETURNING id',
    [id, userId],
  );
  return rows.length > 0;
}

export async function getUploadKey(userId: string, id: number): Promise<string | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT key FROM uploads WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  return rows[0] ? (rows[0].key as string) : null;
}
