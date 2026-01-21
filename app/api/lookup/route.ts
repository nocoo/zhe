import { NextRequest, NextResponse } from 'next/server';
import { getLinkBySlug } from '@/lib/db';

/**
 * GET /api/lookup?slug=xxx
 * Looks up a short link by slug and returns redirect info.
 * Used by middleware to query D1 database.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  try {
    const link = await getLinkBySlug(slug);

    if (!link) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    // Check if expired
    if (link.expiresAt && new Date() > link.expiresAt) {
      return NextResponse.json({ found: false, expired: true }, { status: 404 });
    }

    return NextResponse.json({
      found: true,
      id: link.id,
      originalUrl: link.originalUrl,
      slug: link.slug,
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
