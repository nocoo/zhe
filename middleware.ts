import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { isReservedPath } from '@/lib/constants';
import { getMockLink, isLinkExpired } from '@/lib/mock-links';

export default auth((request) => {
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
      if (!request.auth?.user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
    return NextResponse.next();
  }

  // Look up the short link
  const link = getMockLink(slug);

  // Not found
  if (!link) {
    return NextResponse.rewrite(new URL('/not-found', request.url));
  }

  // Check if expired (expired links also return 404)
  if (isLinkExpired(link)) {
    return NextResponse.rewrite(new URL('/not-found', request.url));
  }

  // TODO: Record click analytics asynchronously
  // waitUntil(recordClick(link.id, request));

  // Redirect to original URL
  return NextResponse.redirect(link.originalUrl, { status: 307 });
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
