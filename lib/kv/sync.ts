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
/** Step 1: fetch all links from D1, recording any failure as a cron result. */
async function fetchLinksOrFail(startTime: number): Promise<
  | { ok: true; links: Awaited<ReturnType<typeof getAllLinksForKV>> }
  | { ok: false; result: SyncResult }
> {
  try {
    return { ok: true, links: await getAllLinksForKV() };
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
    return {
      ok: false,
      result: { synced: 0, failed: 0, deleted: 0, total: 0, durationMs, error: errorMsg },
    };
  }
}

/** Step 3: delete slugs present in KV but not D1. Returns {deleted, deleteFailed, listFailed}. */
async function deleteOrphanedSlugs(
  d1Slugs: Set<string>,
): Promise<{ deleted: number; deleteFailed: number; listFailed: boolean }> {
  const listResult = await kvListKeys();
  if (listResult.error) {
    console.log('sync-kv: skipped orphan deletion due to list failure');
    return { deleted: 0, deleteFailed: 0, listFailed: true };
  }
  const orphanedSlugs = listResult.keys.filter((key) => !d1Slugs.has(key));
  if (orphanedSlugs.length === 0) {
    return { deleted: 0, deleteFailed: 0, listFailed: false };
  }
  const deleteResult = await kvBulkDeleteLinks(orphanedSlugs);
  console.log(
    `sync-kv: deleted ${deleteResult.success} orphaned slugs, ${deleteResult.failed} failed`,
  );
  return { deleted: deleteResult.success, deleteFailed: deleteResult.failed, listFailed: false };
}

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

  const fetchOutcome = await fetchLinksOrFail(startTime);
  if (!fetchOutcome.ok) return fetchOutcome.result;
  const { links } = fetchOutcome;

  // Bulk-write to KV
  const entries = links.map((link) => ({
    slug: link.slug,
    data: { id: link.id, originalUrl: link.originalUrl, expiresAt: link.expiresAt },
  }));
  const result = await kvBulkPutLinks(entries);

  // Delete orphaned slugs only if the write phase fully succeeded.
  let deleted = 0;
  let deleteFailed = 0;
  let listFailed = false;
  if (result.failed === 0) {
    const d1Slugs = new Set(links.map((link) => link.slug));
    ({ deleted, deleteFailed, listFailed } = await deleteOrphanedSlugs(d1Slugs));
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

  if (!hasFailures) clearKVDirty();

  return {
    synced: result.success,
    failed: result.failed,
    deleted,
    total: links.length,
    durationMs,
  };
}
