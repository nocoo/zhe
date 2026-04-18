/**
 * Shared KV sync logic — used by the /api/cron/sync-kv route (cron + manual)
 * and by the worker-status action on first dashboard access.
 *
 * Fire-and-forget safe: errors are caught and recorded, never thrown.
 *
 * Sync strategy: Dirty-gated full sync. When D1 has been mutated (dirty flag
 * is true), performs a full D1 → KV overwrite. When no mutations have occurred
 * since the last successful sync, the call is skipped entirely. This is NOT a
 * delta/incremental sync — every run that proceeds reads all links from D1.
 */

import { getAllLinksForKV } from '@/lib/db';
import { kvBulkPutLinks, kvListKeys, kvBulkDeleteLinks, isKVConfigured } from '@/lib/kv/client';
import { isKVDirty, clearKVDirty } from '@/lib/kv/dirty';
import { recordCronResult } from '@/lib/cron-history';

export { isKVDirty, clearKVDirty, markKVDirty } from '@/lib/kv/dirty';

export interface SyncResult {
  synced: number;
  failed: number;
  deleted: number;
  total: number;
  durationMs: number;
  skipped?: boolean;
  error?: string;
}

/**
 * Execute a full D1 → KV sync and record the result in cron history.
 * Returns the sync result (or an error result if something went wrong).
 */
export async function performKVSync(): Promise<SyncResult> {
  if (!isKVConfigured()) {
    return { synced: 0, failed: 0, deleted: 0, total: 0, durationMs: 0, error: 'KV not configured' };
  }

  if (!isKVDirty()) {
    recordCronResult({
      timestamp: new Date().toISOString(),
      status: 'skipped',
      synced: 0,
      failed: 0,
      total: 0,
      durationMs: 0,
    });
    return { synced: 0, failed: 0, deleted: 0, total: 0, durationMs: 0, skipped: true };
  }

  const startTime = Date.now();

  // 1. Fetch all links from D1
  let links: Awaited<ReturnType<typeof getAllLinksForKV>>;
  try {
    links = await getAllLinksForKV();
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = 'Failed to fetch links from D1';
    console.error('sync-kv:', errorMsg, err);
    recordCronResult({
      timestamp: new Date().toISOString(),
      status: 'error',
      synced: 0,
      failed: 0,
      total: 0,
      durationMs,
      error: errorMsg,
    });
    return { synced: 0, failed: 0, deleted: 0, total: 0, durationMs, error: errorMsg };
  }

  // 2. Bulk-write to KV
  const entries = links.map((link) => ({
    slug: link.slug,
    data: {
      id: link.id,
      originalUrl: link.originalUrl,
      expiresAt: link.expiresAt,
    },
  }));

  const result = await kvBulkPutLinks(entries);

  // 3. Delete orphaned slugs (KV keys not in D1)
  // Only proceed if the write phase was fully successful — otherwise we risk
  // deleting the old slug for a rename while the new slug failed to write.
  let deleted = 0;
  let deleteFailed = 0;
  let listFailed = false;

  if (result.failed === 0) {
    const d1Slugs = new Set(links.map((link) => link.slug));
    const listResult = await kvListKeys();
    listFailed = listResult.error;

    if (!listResult.error) {
      const orphanedSlugs = listResult.keys.filter((key) => !d1Slugs.has(key));

      if (orphanedSlugs.length > 0) {
        const deleteResult = await kvBulkDeleteLinks(orphanedSlugs);
        deleted = deleteResult.success;
        deleteFailed = deleteResult.failed;
        console.log(
          `sync-kv: deleted ${deleted} orphaned slugs, ${deleteFailed} failed`,
        );
      }
    } else {
      console.log('sync-kv: skipped orphan deletion due to list failure');
    }
  } else {
    console.log('sync-kv: skipped orphan deletion due to write failures');
  }

  const durationMs = Date.now() - startTime;
  const hasFailures = result.failed > 0 || deleteFailed > 0 || listFailed;

  console.log(
    `sync-kv: synced ${result.success} links, ${result.failed} failed, deleted ${deleted} orphans, ${durationMs}ms`,
  );

  recordCronResult({
    timestamp: new Date().toISOString(),
    status: hasFailures ? 'error' : 'success',
    synced: result.success,
    failed: result.failed,
    deleted,
    total: links.length,
    durationMs,
  });

  // Only clear dirty flag if both put and delete succeeded
  if (!hasFailures) {
    clearKVDirty();
  }

  return {
    synced: result.success,
    failed: result.failed,
    deleted,
    total: links.length,
    durationMs,
  };
}
