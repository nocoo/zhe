"use server";

import { requireAuth } from "@/lib/auth-context";
import { CONNECTOR_LIFETIME_MS } from "@/lib/connector/auth";
import { getXBookmarks, type XBookmark } from "@/lib/connector/jobs";
import { executeD1Query } from "@/lib/db/d1-client";

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
  const states = await executeD1Query<{ state: string; count: number }>(
    "SELECT state,COUNT(*) AS count FROM x_bookmarks WHERE user_id=? GROUP BY state",
    [userId],
  );
  const [row] = await executeD1Query<{ last_seen: number | null }>(
    "SELECT MAX(p.last_seen_at) AS last_seen FROM x_connector_presence p JOIN api_keys k ON k.id=p.key_id AND k.user_id=p.user_id WHERE p.user_id=? AND k.revoked_at IS NULL AND k.created_at > ? AND (',' || k.scopes || ',') LIKE '%,connector:write,%'",
    [userId, Math.floor((Date.now() - CONNECTOR_LIFETIME_MS) / 1000)],
  );
  return { states, lastSeenAt: row?.last_seen ?? null };
}
