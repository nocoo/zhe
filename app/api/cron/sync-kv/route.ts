import { NextResponse } from 'next/server';
import { getAllLinksForKV } from '@/lib/db';
import { kvBulkPutLinks, isKVConfigured } from '@/lib/kv/client';
import { recordCronResult } from '@/lib/cron-history';

/**
 * POST /api/cron/sync-kv
 *
 * Full D1 → KV sync endpoint. Reads all links from D1 and bulk-writes them
 * to Cloudflare KV. Protected by WORKER_SECRET to prevent unauthorized access.
 *
 * Intended to be called by an external cron scheduler (e.g. Railway cron,
 * GitHub Actions) on a periodic basis (e.g. every 6 hours) as a consistency
 * safety net — the primary sync happens inline on link create/update/delete.
 *
 * Authorization: Bearer <WORKER_SECRET> header or ?secret=<WORKER_SECRET> query param.
 */
export async function POST(request: Request) {
  // 1. Verify WORKER_SECRET
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret) {
    return NextResponse.json(
      { error: 'WORKER_SECRET not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');

  const providedSecret =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : querySecret;

  if (providedSecret !== workerSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  // 2. Check KV is configured
  if (!isKVConfigured()) {
    return NextResponse.json(
      { error: 'KV not configured (missing CLOUDFLARE_KV_NAMESPACE_ID)' },
      { status: 503 },
    );
  }

  // 3. Fetch all links from D1
  const startTime = Date.now();
  let links: Awaited<ReturnType<typeof getAllLinksForKV>>;
  try {
    links = await getAllLinksForKV();
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error('sync-kv: failed to fetch links from D1:', err);
    recordCronResult({
      timestamp: new Date().toISOString(),
      status: 'error',
      synced: 0,
      failed: 0,
      total: 0,
      durationMs,
      error: 'Failed to fetch links from D1',
    });
    return NextResponse.json(
      { error: 'Failed to fetch links from D1' },
      { status: 500 },
    );
  }

  // 4. Bulk-write to KV
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

  return NextResponse.json({
    synced: result.success,
    failed: result.failed,
    total: links.length,
    durationMs,
  });
}
