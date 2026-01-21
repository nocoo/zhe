import { NextRequest, NextResponse } from 'next/server';
import { recordClick, getLinkBySlug } from '@/lib/db';

/**
 * POST /api/record-click
 * Records a click event for analytics.
 * Called asynchronously from middleware after redirect.
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

/**
 * GET /api/record-click
 * Alternative endpoint using query params (for fire-and-forget requests).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const linkIdStr = searchParams.get('linkId');

    if (!linkIdStr) {
      return NextResponse.json(
        { error: 'Missing linkId' },
        { status: 400 }
      );
    }

    const linkId = parseInt(linkIdStr, 10);
    if (isNaN(linkId)) {
      return NextResponse.json(
        { error: 'Invalid linkId' },
        { status: 400 }
      );
    }

    await recordClick({
      linkId,
      device: searchParams.get('device') || null,
      browser: searchParams.get('browser') || null,
      os: searchParams.get('os') || null,
      country: searchParams.get('country') || null,
      city: searchParams.get('city') || null,
      referer: searchParams.get('referer') || null,
    });

    // Return a 1x1 transparent pixel for tracking requests
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    return new NextResponse(pixel, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    console.error('Error recording click:', error);
    return NextResponse.json(
      { error: 'Failed to record click' },
      { status: 500 }
    );
  }
}
