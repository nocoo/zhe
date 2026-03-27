import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { isKVConfigured } from '@/lib/kv/client';
import { performKVSync } from '@/lib/kv/sync';

/** Timing-safe string comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * POST /api/cron/sync-kv
 *
 * Full D1 → KV sync endpoint. Reads all links from D1 and bulk-writes them
 * to Cloudflare KV. Protected by WORKER_SECRET to prevent unauthorized access.
 *
 * Called by the Worker cron (every 30 min) and available for manual trigger
 * from the dashboard. Uses a dirty flag to skip when no mutations have
 * occurred since the last sync.
 *
 * Authorization: Bearer <WORKER_SECRET> header.
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
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !safeCompare(token, workerSecret)) {
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

  // 3. Perform sync (D1 → KV + record cron history)
  const result = await performKVSync();

  if (result.skipped) {
    return NextResponse.json({ skipped: true, message: 'No mutations since last sync' });
  }

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 },
    );
  }

  return NextResponse.json({
    synced: result.synced,
    failed: result.failed,
    total: result.total,
    durationMs: result.durationMs,
  });
}
