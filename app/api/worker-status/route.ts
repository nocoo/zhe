import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getCronHistory } from '@/lib/cron-history';
import { deriveWorkerHealth } from '@/models/overview';

/**
 * GET /api/worker-status
 *
 * Returns Worker health data: cron sync history, last sync time, KV key count,
 * and sync success rate. Auth-protected (dashboard only).
 *
 * The data is derived from the in-memory cron history buffer — no extra
 * Cloudflare API calls needed.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const history = getCronHistory();
  const health = deriveWorkerHealth(history);

  return NextResponse.json(health);
}
