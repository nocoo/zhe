import { NextRequest, NextResponse } from 'next/server';
import { recordClick } from '@/lib/db';

/**
 * POST /api/record-click
 * Records a click event for analytics.
 * Called asynchronously from the Cloudflare Worker via waitUntil.
 * Protected by WORKER_SECRET (Authorization: Bearer) to prevent external abuse.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify caller via shared secret (read at runtime for hot-reload)
    const workerSecret = process.env.WORKER_SECRET;
    if (workerSecret) {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token !== workerSecret) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { linkId, device, browser, os, country, city, referer, source } = body;

    if (!linkId || typeof linkId !== 'number') {
      return NextResponse.json(
        { error: 'Missing or invalid linkId' },
        { status: 400 }
      );
    }

    await recordClick({
      linkId,
      device: device || null,
      browser: browser || null,
      os: os || null,
      country: country || null,
      city: city || null,
      referer: referer || null,
      source: source || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error recording click:', error);
    return NextResponse.json(
      { error: 'Failed to record click' },
      { status: 500 }
    );
  }
}
