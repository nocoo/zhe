/**
 * Resolve the public-facing origin from an incoming request.
 *
 * Behind a reverse proxy (Railway, Vercel, nginx, etc.) the raw
 * `request.url` reflects the internal listener address (e.g.
 * `http://0.0.0.0:7006`). This helper reads forwarding headers set
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
 *
 * Security: when `TRUSTED_ORIGINS` is set (comma-separated `host[:port]`
 * list, no protocol), the derived host is validated against the allowlist
 * before being trusted. If validation fails, falls back to `PUBLIC_ORIGIN`
 * when set; otherwise falls back to the `request.url` origin. This
 * prevents a request with a spoofed `X-Real-Host` / `x-forwarded-host`
 * header from poisoning generated URLs (phishing / open redirect / leaked
 * tokens in webhook docs).
 *
 * When `TRUSTED_ORIGINS` is unset, the derived host is used as-is to
 * preserve backwards compatibility with deployments that have not yet
 * configured the allowlist. Production deployments are expected to set
 * `TRUSTED_ORIGINS` (see `.env.example`).
 */

type HeaderLike = {
  get(name: string): string | null;
};

function parseTrustedHosts(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const entries = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return null;
  return new Set(entries);
}

function deriveHost(headers: HeaderLike): string {
  return (
    headers.get("x-real-host") ||
    headers.get("x-forwarded-host") ||
    headers.get("host") ||
    ""
  );
}

function deriveProto(headers: HeaderLike): string {
  return headers.get("x-forwarded-proto") || "";
}

/**
 * Validate `host` against the configured `TRUSTED_ORIGINS` allowlist.
 * The allowlist is matched case-insensitively as `hostname[:port]`.
 * Returns `true` when no allowlist is configured (opt-in enforcement).
 */
function isTrustedHost(host: string, allow: Set<string> | null): boolean {
  if (!allow) return true;
  return allow.has(host.toLowerCase());
}

function fallbackOrigin(requestUrl: string | null): string {
  const publicOrigin = process.env.PUBLIC_ORIGIN;
  if (publicOrigin) return publicOrigin.replace(/\/+$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  return "";
}

/**
 * Internal: resolve the public origin from a Headers-like accessor and an
 * optional original request URL (used only for the last-resort fallback).
 */
function resolveFromHeaders(
  headers: HeaderLike,
  requestUrl: string | null,
): string {
  const allow = parseTrustedHosts(process.env.TRUSTED_ORIGINS);
  const proto = deriveProto(headers);
  const host = deriveHost(headers);

  if (proto && host && isTrustedHost(host, allow)) {
    return `${proto}://${host}`;
  }

  // Either headers were absent OR the derived host failed allowlist check.
  return fallbackOrigin(requestUrl);
}

export function resolvePublicOrigin(request: Request): string {
  return resolveFromHeaders(request.headers, request.url);
}

/**
 * Same as `resolvePublicOrigin` but for callers that only have a
 * Headers-like object (e.g. Next.js Server Actions which read `headers()`
 * from `next/headers` and have no `Request` in scope).
 */
export function resolvePublicOriginFromHeaders(headers: HeaderLike): string {
  return resolveFromHeaders(headers, null);
}
