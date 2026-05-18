/**
 * User settings operations for ScopedDB (preview style, Backy, xray, pull webhook).
 */

import { executeD1Query } from '../d1-client';
import { rowToUserSettings } from '../mappers';
import type { UserSettings } from '../schema';

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM user_settings WHERE user_id = ? LIMIT 1',
    [userId],
  );
  return rows[0] ? rowToUserSettings(rows[0]) : null;
}

export async function upsertPreviewStyle(
  userId: string,
  previewStyle: string,
): Promise<UserSettings> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO user_settings (user_id, preview_style)
     VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET preview_style = excluded.preview_style
     RETURNING *`,
    [userId, previewStyle],
  );
  const row = rows[0];
  if (!row) throw new Error('UPSERT RETURNING * returned no rows');
  return rowToUserSettings(row);
}

export async function getBackySettings(
  userId: string,
): Promise<{ webhookUrl: string; apiKey: string } | null> {
  const settings = await getUserSettings(userId);
  if (!settings?.backyWebhookUrl || !settings?.backyApiKey) return null;
  return { webhookUrl: settings.backyWebhookUrl, apiKey: settings.backyApiKey };
}

export async function upsertBackySettings(
  userId: string,
  data: { webhookUrl: string; apiKey: string },
): Promise<UserSettings> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO user_settings (user_id, preview_style, backy_webhook_url, backy_api_key)
     VALUES (?, 'favicon', ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET backy_webhook_url = excluded.backy_webhook_url, backy_api_key = excluded.backy_api_key
     RETURNING *`,
    [userId, data.webhookUrl, data.apiKey],
  );
  const row = rows[0];
  if (!row) throw new Error('UPSERT RETURNING * returned no rows');
  return rowToUserSettings(row);
}

export async function getXraySettings(
  userId: string,
): Promise<{ apiUrl: string; apiToken: string } | null> {
  const settings = await getUserSettings(userId);
  if (!settings?.xrayApiUrl || !settings?.xrayApiToken) return null;
  return { apiUrl: settings.xrayApiUrl, apiToken: settings.xrayApiToken };
}

export async function upsertXraySettings(
  userId: string,
  data: { apiUrl: string; apiToken: string },
): Promise<UserSettings> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO user_settings (user_id, preview_style, xray_api_url, xray_api_token)
     VALUES (?, 'favicon', ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET xray_api_url = excluded.xray_api_url, xray_api_token = excluded.xray_api_token
     RETURNING *`,
    [userId, data.apiUrl, data.apiToken],
  );
  const row = rows[0];
  if (!row) throw new Error('UPSERT RETURNING * returned no rows');
  return rowToUserSettings(row);
}

export async function getBackyPullWebhook(
  userId: string,
): Promise<{ key: string } | null> {
  const settings = await getUserSettings(userId);
  if (!settings?.backyPullKey) return null;
  return { key: settings.backyPullKey };
}

export async function upsertBackyPullWebhook(
  userId: string,
  data: { key: string },
): Promise<UserSettings> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO user_settings (user_id, preview_style, backy_pull_key)
     VALUES (?, 'favicon', ?)
     ON CONFLICT (user_id) DO UPDATE SET backy_pull_key = excluded.backy_pull_key
     RETURNING *`,
    [userId, data.key],
  );
  const row = rows[0];
  if (!row) throw new Error('UPSERT RETURNING * returned no rows');
  return rowToUserSettings(row);
}

export async function deleteBackyPullWebhook(
  userId: string,
): Promise<UserSettings | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `UPDATE user_settings SET backy_pull_key = NULL WHERE user_id = ? RETURNING *`,
    [userId],
  );
  return rows[0] ? rowToUserSettings(rows[0]) : null;
}
