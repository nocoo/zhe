/**
 * GET /api/live — Health check endpoint (surety standard).
 *
 * Returns structured health status including version, uptime, timestamp,
 * and database connectivity. 200 = healthy, 503 = unhealthy.
 */
import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';
import { executeD1Query, isD1Configured } from '@/lib/db/d1-client';

const headers = { 'Cache-Control': 'no-store' } as const;

/** Sanitize error messages — strip sensitive tokens. */
function sanitize(message: string): string {
  return message.replace(/\bok\b/gi, '***');
}

async function probeDatabase(): Promise<{ connected: boolean; error?: string }> {
  if (!isD1Configured()) {
    return { connected: false, error: 'D1 not configured' };
  }

  try {
    await executeD1Query<{ probe: number }>('SELECT 1 AS probe');
    return { connected: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { connected: false, error: sanitize(message) };
  }
}

export async function GET() {
  const database = await probeDatabase();
  const isHealthy = database.connected;

  const body = {
    status: isHealthy ? ('ok' as const) : ('error' as const),
    version: APP_VERSION,
    component: 'zhe',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database,
  };

  return NextResponse.json(body, {
    status: isHealthy ? 200 : 503,
    headers,
  });
}
