/**
 * Webhook operations for ScopedDB (one per user).
 */

import { executeD1Query } from '../d1-client';
import { rowToWebhook } from '../mappers';
import type { Webhook } from '../schema';

export async function getWebhook(userId: string): Promise<Webhook | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM webhooks WHERE user_id = ? LIMIT 1',
    [userId],
  );
  return rows[0] ? rowToWebhook(rows[0]) : null;
}

export async function upsertWebhook(userId: string, token: string): Promise<Webhook> {
  const now = Date.now();
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO webhooks (user_id, token, rate_limit, created_at) VALUES (?, ?, 5, ?)
     ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at
     RETURNING *`,
    [userId, token, now],
  );
  const row = rows[0];
  if (!row) throw new Error('UPSERT RETURNING * returned no rows');
  return rowToWebhook(row);
}

export async function updateWebhookRateLimit(
  userId: string,
  rateLimit: number,
): Promise<Webhook | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'UPDATE webhooks SET rate_limit = ? WHERE user_id = ? RETURNING *',
    [rateLimit, userId],
  );
  return rows[0] ? rowToWebhook(rows[0]) : null;
}

export async function deleteWebhook(userId: string): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'DELETE FROM webhooks WHERE user_id = ? RETURNING id',
    [userId],
  );
  return rows.length > 0;
}
