import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { auth } from '@/auth';
import { isReservedPath } from '@/lib/constants';
import { extractClickMetadata } from '@/lib/analytics';
import { getLinkBySlug, recordClick } from '@/lib/db';
import type { Link } from '@/lib/db/schema';

// ─── In-memory LRU cache for slug lookups ──────────────────────────────────
// Avoids a D1 HTTP round-trip on every redirect for popular short links.
// Entries expire after SLUG_CACHE_TTL_MS; cache size is bounded by SLUG_CACHE_MAX.

const SLUG_CACHE_TTL_MS = 60_000; // 60 seconds
const SLUG_CACHE_MAX = 1_000;

interface CacheEntry {
  link: Link | null;
  expiresAt: number;
}

const slugCache = new Map<string, CacheEntry>();

/** Get a cached slug lookup, returning undefined on miss/expiry. */
function getCachedSlug(slug: string): Link | null | undefined {
  const entry = slugCache.get(slug);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    slugCache.delete(slug);
    return undefined;
  }
  // Move to end for LRU ordering (Map preserves insertion order)
  slugCache.delete(slug);
  slugCache.set(slug, entry);
  return entry.link;
}

/** Cache a slug lookup result. Evicts oldest entry when at capacity. */
function setCachedSlug(slug: string, link: Link | null): void {
  // Evict oldest if at capacity
  if (slugCache.size >= SLUG_CACHE_MAX && !slugCache.has(slug)) {
    const oldest = slugCache.keys().next().value;
    if (oldest !== undefined) slugCache.delete(oldest);
  }
  slugCache.set(slug, { link, expiresAt: Date.now() + SLUG_CACHE_TTL_MS });
}

// Export for testing
export { slugCache, getCachedSlug, setCachedSlug, SLUG_CACHE_TTL_MS, SLUG_CACHE_MAX };

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // Skip root path
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Get the first segment of the path (potential slug)
  const slug = pathname.slice(1).split('/')[0];

  // Skip reserved paths - let Auth.js and Next.js handle them
  if (isReservedPath(slug)) {
    // Check auth for dashboard
    if (pathname.startsWith('/dashboard')) {
      const session = await auth();
      if (!session?.user) {
        const loginUrl = new URL('/', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
    return NextResponse.next();
  }

  // Look up the short link — check cache first, then D1
  try {
    let link = getCachedSlug(slug);

    if (link === undefined) {
      // Cache miss — query D1 and cache the result
      const dbLink = await getLinkBySlug(slug);
      setCachedSlug(slug, dbLink);
      link = dbLink;
    }

    // Not found
    if (!link) {
      return NextResponse.rewrite(new URL('/not-found', request.url));
    }

    // Expired
    if (link.expiresAt && new Date() > link.expiresAt) {
      return NextResponse.rewrite(new URL('/not-found', request.url));
    }

    // Record click analytics using waitUntil for non-blocking execution
    const metadata = extractClickMetadata(request.headers);

    event.waitUntil(
      recordClick({
        linkId: link.id,
        device: metadata.device,
        browser: metadata.browser,
        os: metadata.os,
        country: metadata.country,
        city: metadata.city,
        referer: metadata.referer,
      }).catch((err) => {
        console.error('Failed to record click:', err);
      })
    );

    // Redirect to original URL immediately (no waiting for analytics)
    return NextResponse.redirect(link.originalUrl, { status: 307 });
  } catch (error) {
    console.error('Middleware lookup error:', error);
    return NextResponse.rewrite(new URL('/not-found', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - Static assets (images, icons, etc.)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|sitemap.xml|robots.txt).*)',
  ],
};
