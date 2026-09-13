import { executeD1Query } from "@/lib/db/d1-client";
import { deleteR2Object } from "./client";

export async function enqueueR2Deletion(
  key: string,
  userId: string,
  now = Date.now(),
): Promise<void> {
  // The timestamp also identifies this cleanup request. Advance even within
  // the same millisecond so an in-flight DELETE cannot acknowledge newer work.
  await executeD1Query(
    `INSERT INTO r2_deletions(key,user_id,created_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET created_at=MAX(r2_deletions.created_at+1,excluded.created_at)`,
    [key, userId, now],
  );
}

/** Also protects uploads that have been reserved but not published yet. */
export async function connectorStorageKeys(): Promise<string[]> {
  const rows = await executeD1Query<{ r2_key: string }>("SELECT r2_key FROM x_media");
  return rows.map((row) => row.r2_key);
}

/** Deletions survive restarts and R2 failures; every caller uses the same queue. */
export async function drainR2Deletions(userId?: string, now = Date.now()): Promise<number> {
  await executeD1Query(
    `DELETE FROM x_media WHERE state <> 'published' AND created_at < ?
    AND NOT EXISTS(SELECT 1 FROM x_bookmarks x WHERE x.link_id=x_media.link_id AND x.state='running' AND x.lease_until > ?)
    ${userId ? "AND user_id=?" : ""}`,
    [now - 3_600_000, now, ...(userId ? [userId] : [])],
  );
  const publicDomain = (process.env.R2_PUBLIC_DOMAIN ?? "").replace(/\/$/, "");
  const pending = await executeD1Query<{ key: string; created_at: number }>(
    `SELECT key,created_at FROM r2_deletions d
    WHERE NOT EXISTS(SELECT 1 FROM uploads WHERE key=d.key)
      AND NOT EXISTS(SELECT 1 FROM x_media WHERE r2_key=d.key)
      AND NOT EXISTS(SELECT 1 FROM links WHERE screenshot_url=? || '/' || d.key)
      ${userId ? "AND user_id=?" : ""}
    ORDER BY created_at LIMIT 100`,
    [publicDomain, ...(userId ? [userId] : [])],
  );
  let deleted = 0;
  for (const { key, created_at } of pending) {
    const referenced = await executeD1Query(
      `SELECT 1 FROM uploads WHERE key=?
      UNION ALL SELECT 1 FROM x_media WHERE r2_key=?
      UNION ALL SELECT 1 FROM links WHERE screenshot_url=? LIMIT 1`,
      [key, key, `${publicDomain}/${key}`],
    );
    if (referenced.length) continue;
    try {
      await deleteR2Object(key);
      await executeD1Query("DELETE FROM r2_deletions WHERE key=? AND created_at=?", [
        key,
        created_at,
      ]);
      deleted++;
    } catch {
      // Durable queue retains the exact key for the next poll / cleanup cron.
    }
  }
  return deleted;
}
