/**
 * Resolve the public-facing origin from an incoming request.
 *
 * Behind a reverse proxy (Railway, Vercel, nginx, etc.) the raw
 * `request.url` reflects the internal listener address (e.g.
 * `http://0.0.0.0:7005`). This helper reads `x-forwarded-proto` and
 * `x-forwarded-host` headers set by the proxy to reconstruct the
 * real public origin that end-users see (e.g. `https://zhe.to`).
 *
 * Falls back to `request.url` when no forwarding headers are present
 * (local development without a proxy).
 */
export function resolvePublicOrigin(request: Request): string {
  const headers = request.headers;
  const proto = headers.get("x-forwarded-proto") || "";
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";

  if (proto && host) {
    return `${proto}://${host}`;
  }

  // Fallback: extract origin from request.url (works in local dev)
  return new URL(request.url).origin;
}
