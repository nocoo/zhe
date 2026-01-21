import { NextRequest, NextResponse } from 'next/server';
import { recordClick } from '@/lib/db';

/**
 * POST /api/record-click
 * Records a click event for analytics.
 * Called asynchronously from middleware via waitUntil.
 */
export async function POST(request: NextRequest) {
  try {
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
