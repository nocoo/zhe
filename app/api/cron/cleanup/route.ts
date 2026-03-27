import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { listR2Objects, deleteR2Objects } from '@/lib/r2/client';
import { TMP_PREFIX, findExpiredTmpKeys } from '@/models/tmp-storage';

/** Timing-safe string comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * POST /api/cron/cleanup
 *
 * Delete expired temporary files from R2. Files older than 1 hour (based on
 * the timestamp embedded in the filename) are removed.
 *
 * Called every 30 minutes by the Cloudflare Worker cron trigger.
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

  // 2. List all objects under tmp/ prefix
  let allKeys: string[];
  try {
    const objects = await listR2Objects(TMP_PREFIX);
    allKeys = objects.map((o) => o.key);
  } catch (err) {
    console.error('Failed to list tmp/ objects:', err);
    return NextResponse.json(
      { error: 'Failed to list tmp objects' },
      { status: 500 },
    );
  }

  if (allKeys.length === 0) {
    return NextResponse.json({ deleted: 0, total: 0 });
  }

  // 3. Find expired keys (older than 1 hour based on filename timestamp)
  const expiredKeys = findExpiredTmpKeys(allKeys, Date.now());

  if (expiredKeys.length === 0) {
    return NextResponse.json({ deleted: 0, total: allKeys.length });
  }

  // 4. Batch delete expired files
  let deleted = 0;
  try {
    deleted = await deleteR2Objects(expiredKeys);
  } catch (err) {
    console.error('Failed to delete expired tmp files:', err);
    return NextResponse.json(
      { error: 'Failed to delete expired files' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deleted,
    expired: expiredKeys.length,
    total: allKeys.length,
  });
}
