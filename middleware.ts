import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { auth } from '@/auth';
import { isReservedPath } from '@/lib/constants';
import { extractClickMetadata } from '@/lib/analytics';
import { getLinkBySlug, recordClick } from '@/lib/db';

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

  // Look up the short link directly via D1 (no self-fetch)
  try {
    const link = await getLinkBySlug(slug);

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
