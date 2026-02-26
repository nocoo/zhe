/**
 * GET /api/live — Lightweight liveness probe for external monitors.
 *
 * Returns system status with minimal metadata. No auth, no caching,
 * no external dependency checks. Always returns 200 if the process
 * is running.
 */
import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';

export const runtime = 'edge';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
