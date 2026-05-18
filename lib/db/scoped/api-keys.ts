/**
 * API key operations for ScopedDB.
 */

import { executeD1Query } from '../d1-client';
import { rowToApiKey } from '../mappers';
import type { ApiKey } from '../schema';

export async function getApiKeys(userId: string): Promise<ApiKey[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT * FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(rowToApiKey);
}

export async function createApiKey(
  userId: string,
  data: {
    id: string;
    prefix: string;
    keyHash: string;
    name: string;
    scopes: string;
  },
): Promise<ApiKey> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO api_keys (id, prefix, key_hash, user_id, name, scopes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [data.id, data.prefix, data.keyHash, userId, data.name, data.scopes, now],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT RETURNING * returned no rows');
  return rowToApiKey(row);
}

export async function revokeApiKey(userId: string, id: string): Promise<ApiKey | null> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL RETURNING *`,
    [now, id, userId],
  );
  return rows[0] ? rowToApiKey(rows[0]) : null;
}

export async function updateApiKeyLastUsed(id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await executeD1Query(
    `UPDATE api_keys SET last_used_at = ? WHERE id = ?`,
    [now, id],
  );
}
