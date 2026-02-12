import { NextRequest, NextResponse } from 'next/server';
import { recordClick } from '@/lib/db';

/**
 * POST /api/record-click
 * Records a click event for analytics.
 * Called asynchronously from middleware via waitUntil.
 * Protected by a shared secret to prevent external abuse.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify internal caller via shared secret (read at runtime for hot-reload)
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret) {
      const authHeader = request.headers.get('x-internal-secret');
      if (authHeader !== internalSecret) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { linkId, device, browser, os, country, city, referer } = body;

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
