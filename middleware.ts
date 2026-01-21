import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isReservedPath } from '@/lib/constants';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip root path
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Get the first segment of the path (potential slug)
  const slug = pathname.slice(1).split('/')[0];

  // Skip reserved paths
  if (isReservedPath(slug)) {
    return NextResponse.next();
  }

  // TODO: Phase 1 - Look up slug in database and redirect
  // For now, all non-reserved paths go to 404
  return NextResponse.rewrite(new URL('/not-found', request.url));
}

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
