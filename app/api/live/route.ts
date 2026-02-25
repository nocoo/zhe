/**
 * GET /api/live — Liveness probe for external monitors.
 *
 * Verifies core dependency connectivity (D1 database) and returns
 * system status with lightweight metadata. Designed for high-frequency
 * polling; no auth, no caching.
 */
import { NextResponse } from 'next/server';
import { executeD1Query, isD1Configured } from '@/lib/db/d1-client';
import { APP_VERSION } from '@/lib/version';

export const runtime = 'edge';

/** Lightweight D1 ping — single-row SELECT, no table scan. */
async function checkDatabase(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  if (!isD1Configured()) {
    return { connected: false, latencyMs: 0, error: 'database credentials not configured' };
  }

  const start = Date.now();
  try {
    await executeD1Query<{ result: number }>('SELECT 1 AS result');
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'unexpected database failure';
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: message.replaceAll('ok', '**').replaceAll('OK', '**'),
    };
  }
}

export async function GET() {
  const db = await checkDatabase();

  const healthy = db.connected;

  const body: Record<string, unknown> = {
    status: healthy ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    // NOTE: process.uptime() is unavailable in Edge Runtime
    dependencies: {
      database: db,
    },
  };

  if (!healthy) {
    body.message = 'one or more dependencies are unreachable';
  }

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
