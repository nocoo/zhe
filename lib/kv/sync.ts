/**
 * Shared KV sync logic — used by the /api/cron/sync-kv route
 * and by `instrumentation.ts` to seed cron history on server startup.
 *
 * Fire-and-forget safe: errors are caught and recorded, never thrown.
 *
 * Delta sync: A dirty flag (in lib/kv/dirty.ts) tracks whether any KV
 * mutation (kvPutLink / kvDeleteLink) has occurred since the last full
 * sync. When cron calls `performKVSync()` and dirty is false, the sync
 * is skipped entirely — no D1 query, no KV write — saving API requests.
 * The flag starts as `true` so the first cron after deploy always syncs.
 */

import { getAllLinksForKV } from '@/lib/db';
import { kvBulkPutLinks, isKVConfigured } from '@/lib/kv/client';
import { isKVDirty, clearKVDirty } from '@/lib/kv/dirty';
import { recordCronResult } from '@/lib/cron-history';

// Re-export dirty flag utilities for convenience
export { markKVDirty, isKVDirty, _resetDirtyFlag } from '@/lib/kv/dirty';

export interface SyncResult {
  synced: number;
  failed: number;
  total: number;
  durationMs: number;
  skipped?: boolean;
  error?: string;
}

/**
 * Execute a full D1 → KV sync and record the result in cron history.
 * Returns the sync result (or an error result if something went wrong).
 *
 * When the dirty flag is false, the sync is skipped entirely and a
 * `{ skipped: true }` result is recorded in cron history.
 */
export async function performKVSync(): Promise<SyncResult> {
  if (!isKVConfigured()) {
    return { synced: 0, failed: 0, total: 0, durationMs: 0, error: 'KV not configured' };
  }

  // ── Delta check: skip if nothing changed since last sync ──
  if (!isKVDirty()) {
    console.log('sync-kv: skipped (no changes since last sync)');
    recordCronResult({
      timestamp: new Date().toISOString(),
      status: 'skipped',
      synced: 0,
      failed: 0,
      total: 0,
      durationMs: 0,
    });
    return { synced: 0, failed: 0, total: 0, durationMs: 0, skipped: true };
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
    return { synced: 0, failed: 0, total: 0, durationMs, error: errorMsg };
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
  const durationMs = Date.now() - startTime;

  // 3. Clear dirty flag on successful sync (no failures)
  if (result.failed === 0) {
    clearKVDirty();
  }

  console.log(
    `sync-kv: synced ${result.success} links, ${result.failed} failed, ${durationMs}ms`,
  );

  recordCronResult({
    timestamp: new Date().toISOString(),
    status: result.failed > 0 ? 'error' : 'success',
    synced: result.success,
    failed: result.failed,
    total: links.length,
    durationMs,
  });

  return {
    synced: result.success,
    failed: result.failed,
    total: links.length,
    durationMs,
  };
}
