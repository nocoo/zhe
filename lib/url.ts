/**
 * Resolve the public-facing origin from an incoming request.
 *
 * Behind a reverse proxy (Railway, Vercel, nginx, etc.) the raw
 * `request.url` reflects the internal listener address (e.g.
 * `http://0.0.0.0:7005`). This helper reads forwarding headers set
 * by the proxy to reconstruct the real public origin that end-users
 * see (e.g. `https://zhe.to`).
 *
 * Header priority:
 * 1. `X-Real-Host` — custom header set by the Cloudflare Worker that
 *    Railway's reverse proxy cannot overwrite (most reliable).
 * 2. `x-forwarded-host` — standard proxy header (Railway may overwrite
 *    this with `origin.zhe.to`, so it is only a fallback).
 * 3. `host` — the HTTP Host header.
 * 4. `request.url` origin — last resort for local development.
 */
export function resolvePublicOrigin(request: Request): string {
  const headers = request.headers;
  const proto = headers.get("x-forwarded-proto") || "";
  const host =
    headers.get("x-real-host") ||
    headers.get("x-forwarded-host") ||
    headers.get("host") ||
    "";

  if (proto && host) {
    return `${proto}://${host}`;
  }

  // Fallback: extract origin from request.url (works in local dev)
  return new URL(request.url).origin;
}
