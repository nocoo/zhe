import { executeD1Query } from "@/lib/db/d1-client";
import { deleteR2Object } from "./client";

export async function enqueueR2Deletion(
  key: string,
  userId: string,
  now = Date.now(),
): Promise<void> {
  await executeD1Query("INSERT OR IGNORE INTO r2_deletions(key,user_id,created_at) VALUES(?,?,?)", [
    key,
    userId,
    now,
  ]);
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
  const pending = await executeD1Query<{ key: string }>(
    `SELECT key FROM r2_deletions ${userId ? "WHERE user_id=?" : ""} ORDER BY created_at LIMIT 100`,
    userId ? [userId] : [],
  );
  let deleted = 0;
  for (const { key } of pending) {
    const referenced = await executeD1Query(
      `SELECT 1 FROM uploads WHERE key=?
      UNION ALL SELECT 1 FROM x_media WHERE r2_key=?
      UNION ALL SELECT 1 FROM links WHERE screenshot_url=? LIMIT 1`,
      [key, key, `${(process.env.R2_PUBLIC_DOMAIN ?? "").replace(/\/$/, "")}/${key}`],
    );
    if (referenced.length) continue;
    try {
      await deleteR2Object(key);
      await executeD1Query("DELETE FROM r2_deletions WHERE key=?", [key]);
      deleted++;
    } catch {
      // Durable queue retains the exact key for the next poll / cleanup cron.
    }
  }
  return deleted;
}
