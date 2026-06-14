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
 * when set; otherwise falls back to the `request.url` origin.
 *
 * The scheme from `x-forwarded-proto` is always normalised: only `http`
 * and `https` are accepted, comma-chained values are reduced to the first
 * segment, and the comparison is case-insensitive. Any other value (e.g.
 * `javascript`, `data`) is rejected so it cannot poison redirects /
 * generated URLs, even when the host happens to be on the allowlist.
 *
 * When `TRUSTED_ORIGINS` is unset, the derived host is used as-is to
 * preserve backwards compatibility with deployments that have not yet
 * configured the allowlist. Production deployments are expected to set
 * `TRUSTED_ORIGINS` (see `.env.example`).
 */

type HeaderLike = {
  get(name: string): string | null;
};

const VALID_SCHEMES = new Set(["http", "https"]);

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

/**
 * Normalise a raw `x-forwarded-proto` value to `http` / `https`, or
 * return `null` when the header is missing OR present-but-invalid.
 *
 * Callers distinguish the two cases by checking the raw value
 * themselves: an absent header is recoverable (a default may be
 * applied), but an explicitly-set malicious value is not — it must
 * route through the safe fallback path.
 */
function normalizeProto(raw: string | null): string | null {
  if (raw === null) return null;
  const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  return VALID_SCHEMES.has(first) ? first : null;
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

type ResolveOptions = {
  /**
   * Scheme to assume when `x-forwarded-proto` is absent entirely.
   * Used by `resolvePublicOriginFromHeaders` to preserve the legacy
   * Server Action behavior of treating a bare `host` header as HTTP.
   * Never applied when the header is present-but-invalid — that case
   * always routes to the safe fallback path.
   */
  defaultProto?: "http" | "https";
};

function resolveFromHeaders(
  headers: HeaderLike,
  requestUrl: string | null,
  opts: ResolveOptions = {},
): string {
  const rawProto = headers.get("x-forwarded-proto");
  const normalizedProto = normalizeProto(rawProto);
  // Apply the default only when the header was absent. A present-but-invalid
  // value (e.g. `javascript`) MUST NOT be silently coerced to `http`.
  const proto =
    normalizedProto ?? (rawProto === null ? opts.defaultProto ?? null : null);

  const host = deriveHost(headers);
  const allow = parseTrustedHosts(process.env.TRUSTED_ORIGINS);

  if (proto && host && isTrustedHost(host, allow)) {
    return `${proto}://${host}`;
  }

  return fallbackOrigin(requestUrl);
}

export function resolvePublicOrigin(request: Request): string {
  return resolveFromHeaders(request.headers, request.url);
}

/**
 * Same as `resolvePublicOrigin` but for callers that only have a
 * Headers-like object (e.g. Next.js Server Actions which read `headers()`
 * from `next/headers` and have no `Request` in scope).
 *
 * Preserves the legacy Server Action default of assuming `http` when
 * `x-forwarded-proto` is absent — but only for absent, not invalid,
 * headers. A present-but-invalid scheme still falls through to the
 * safe `PUBLIC_ORIGIN` / empty-string fallback.
 */
export function resolvePublicOriginFromHeaders(headers: HeaderLike): string {
  return resolveFromHeaders(headers, null, { defaultProto: "http" });
}
