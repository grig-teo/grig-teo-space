import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Reject paths with percent-encoded dots/slashes (traversal probes like
  // /api/blog/..%2f..%2f). Left through, Next.js decodes them inside the /api
  // rewrite proxy, which crashes with a 500 — fail fast with 400 instead.
  // Only the path is checked; query strings may legitimately contain
  // percent-encoded characters (OAuth callbacks, etc.).
  const path = new URL(request.url).pathname;
  if (/%2e|%2f/i.test(path)) {
    return new NextResponse('Bad Request', { status: 400 });
  }
  // API paths are proxied to the backend via rewrites; locale middleware
  // must not touch them.
  if (path.startsWith('/api/')) {
    return NextResponse.next();
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(ru|en|ro)/:path*', '/api/:path*'],
};
