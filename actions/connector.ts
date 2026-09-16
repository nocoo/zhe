"use server";

import type { XCapture } from "@/cli/src/connector/core";
import { requireAuth } from "@/lib/auth-context";
import { connectorStates } from "@/lib/connector/github-jobs";
import { getXBookmarks, type XBookmark } from "@/lib/connector/jobs";
import { executeD1Query } from "@/lib/db/d1-client";
import type { XMediaDimensions } from "@/models/x-bookmarks";

export async function updateXMediaDimensionsAction(
  id: number,
  dimensions: XMediaDimensions[],
): Promise<{ success: boolean; updatedAt?: number }> {
  const userId = await requireAuth();
  if (
    !userId ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Array.isArray(dimensions) ||
    !dimensions.length ||
    dimensions.length > 16 ||
    dimensions.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !/^\d{1,22}$/.test(item.id) ||
        !Number.isSafeInteger(item.width) ||
        !Number.isSafeInteger(item.height) ||
        item.width <= 0 ||
        item.height <= 0 ||
        item.width > 65535 ||
        item.height > 65535,
    ) ||
    new Set(dimensions.map((item) => item.id)).size !== dimensions.length
  )
    return { success: false };

  try {
    const [row] = await executeD1Query<{ result_json: string; updated_at: number }>(
      `SELECT result_json,updated_at FROM x_bookmarks WHERE link_id=? AND user_id=?
        AND result_json IS NOT NULL AND (state <> 'running' OR lease_until <= ?)`,
      [id, userId, Date.now()],
    );
    if (!row) return { success: false };
    const capture = JSON.parse(row.result_json) as XCapture;
    for (const item of dimensions) {
      const media = capture.tweet.media.find((media) => media.id === item.id);
      if (!media) return { success: false };
      media.width = item.width;
      media.height = item.height;
    }
    capture.media = capture.tweet.media;
    const updatedAt = Math.max(Date.now(), row.updated_at + 1);
    // Compare the original capture so a concurrent completion or edit cannot
    // be overwritten. Reuse its dimension hints without touching stored files.
    const rows = await executeD1Query(
      `UPDATE x_bookmarks SET result_json=?,updated_at=?
        WHERE link_id=? AND user_id=? AND result_json=?
        AND (state <> 'running' OR lease_until <= ?) RETURNING link_id`,
      [JSON.stringify(capture), updatedAt, id, userId, row.result_json, Date.now()],
    );
    return rows.length ? { success: true, updatedAt } : { success: false };
  } catch {
    return { success: false };
  }
}

export async function loadXBookmarks(
  ids: number[],
): Promise<{ success: boolean; data?: XBookmark[] }> {
  const userId = await requireAuth();
  if (
    !userId ||
    !Array.isArray(ids) ||
    ids.length > 80 ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    return { success: false };
  try {
    return { success: true, data: await getXBookmarks(userId, ids) };
  } catch {
    return { success: false };
  }
}

export async function retryXBookmarkAction(id: number): Promise<{ success: boolean }> {
  const userId = await requireAuth();
  if (!userId || !Number.isSafeInteger(id) || id <= 0) return { success: false };
  try {
    const rows = await executeD1Query(
      `UPDATE x_bookmarks SET state='pending', attempts=0, next_attempt_at=0, lease_until=0, draft_json=NULL, error_code=NULL
      WHERE link_id=? AND user_id=? AND (state <> 'running' OR lease_until <= ?) RETURNING link_id`,
      [id, userId, Date.now()],
    );
    return { success: rows.length > 0 };
  } catch {
    return { success: false };
  }
}

export async function loadConnectorSummary(): Promise<{
  states: { state: string; count: number }[];
  lastSeenAt: number | null;
}> {
  const userId = await requireAuth();
  if (!userId) return { states: [], lastSeenAt: null };
  const states = await connectorStates(userId);
  const [row] = await executeD1Query<{ last_seen: number | null }>(
    "SELECT MAX(p.last_seen_at) AS last_seen FROM x_connector_presence p JOIN api_keys k ON k.id=p.key_id AND k.user_id=p.user_id WHERE p.user_id=? AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > ?) AND (',' || k.scopes || ',') LIKE '%,connector:write,%'",
    [userId, Math.floor(Date.now() / 1000)],
  );
  return { states, lastSeenAt: row?.last_seen ?? null };
}
