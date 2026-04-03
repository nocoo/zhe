/**
 * Shared D1 HTTP Client for Cloudflare D1 database access.
 * Used by both the main db module and Auth.js adapter.
 *
 * Queries route through Worker D1 proxy when available (via D1_PROXY_URL),
 * otherwise fall back to Cloudflare HTTP API. The proxy path is 10-100x faster
 * because it uses native D1 binding instead of cross-region HTTP calls.
 */

/** Timeout for D1 HTTP API requests (ms). Prevents hung fetches from blocking middleware indefinitely. */
const D1_FETCH_TIMEOUT_MS = 5_000;

/** Timeout for Worker proxy requests (ms). Proxy is edge-local, so needs less timeout than HTTP API. */
const PROXY_FETCH_TIMEOUT_MS = 10_000;

interface D1Response<T> {
  success: boolean;
  result: Array<{
    results: T[];
    success: boolean;
    meta: {
      changes: number;
      last_row_id: number;
      rows_read?: number;
      rows_written?: number;
    };
  }>;
  errors: Array<{ message: string }>;
}

/** Common headers for all D1 HTTP requests. */
function getD1Headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Connection: 'keep-alive',
  };
}

/** Check if Worker D1 proxy credentials are configured. */
function getProxyCredentials(): { url: string; secret: string } | null {
  const url = process.env.D1_PROXY_URL;
  const secret = process.env.D1_PROXY_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}

/** Request/response format for Worker D1 proxy. */
interface D1ProxyRequest {
  sql: string;
  params: unknown[];
}

interface D1ProxyResponse {
  success: boolean;
  results?: unknown[];
  meta?: { changes: number; last_row_id: number };
  error?: string;
}

/**
 * Execute query via Worker D1 proxy (native binding path).
 * This is 10-100x faster than HTTP API because Worker uses env.DB binding.
 */
async function executeViaWorkerProxy<T>(
  proxy: { url: string; secret: string },
  sql: string,
  params: unknown[],
): Promise<T[]> {
  const { url, secret } = proxy;
  const endpoint = url.endsWith('/') ? `${url}api/d1-query` : `${url}/api/d1-query`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ sql, params } satisfies D1ProxyRequest),
    signal: AbortSignal.timeout(PROXY_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Non-2xx from proxy means auth/infrastructure error (not query error)
    const error = await response.text();
    console.error('Worker proxy HTTP error:', error);
    throw new Error('D1 query failed');
  }

  const data: D1ProxyResponse = await response.json();

  // Proxy returns HTTP 200 even for query errors — check success field
  if (!data.success) {
    console.error('Worker proxy query error:', data.error);
    // Proxy normalizes errors: UNIQUE → "UNIQUE constraint failed", all others → "D1 query failed"
    throw new Error(data.error || 'D1 query failed');
  }

  return (data.results || []) as T[];
}

/** Validate that D1 credentials are present and return them. */
function getD1Credentials(): { accountId: string; databaseId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error('D1 credentials not configured');
  }

  return { accountId, databaseId, token };
}

/**
 * Execute a SQL query against Cloudflare D1.
 *
 * Routes through Worker D1 proxy when available (D1_PROXY_URL + D1_PROXY_SECRET),
 * otherwise falls back to direct HTTP API. The proxy path is significantly faster
 * because it uses native D1 binding at the edge instead of cross-region HTTP.
 *
 * Error contract:
 * - UNIQUE constraint errors → "UNIQUE constraint failed" (for caller detection)
 * - All other errors → "D1 query failed" (sanitized)
 */
export async function executeD1Query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  // Try Worker proxy first (fast path)
  const proxy = getProxyCredentials();
  if (proxy) {
    return executeViaWorkerProxy<T>(proxy, sql, params);
  }

  // Fallback to HTTP API (slow path, cross-region)
  const { accountId, databaseId, token } = getD1Credentials();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: getD1Headers(token),
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(D1_FETCH_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('D1 HTTP error:', error);
    // Preserve constraint errors for callers that need to detect them
    if (/unique/i.test(error)) {
      throw new Error('UNIQUE constraint failed');
    }
    throw new Error('D1 query failed');
  }

  const data: D1Response<T> = await response.json();

  if (!data.success) {
    const detail = data.errors.map((e) => e.message).join(', ');
    console.error('D1 query error:', detail);
    // Preserve constraint errors for callers that need to detect them,
    // but strip all other internal details from the thrown message.
    if (/unique/i.test(detail)) {
      throw new Error('UNIQUE constraint failed');
    }
    throw new Error('D1 query failed');
  }

  return data.result[0]?.results || [];
}

/**
 * Check if D1 is configured and available.
 *
 * D1 is accessible via either:
 * 1. Worker D1 proxy (D1_PROXY_URL + D1_PROXY_SECRET) — fast path
 * 2. Direct HTTP API (CLOUDFLARE_ACCOUNT_ID + DATABASE_ID + API_TOKEN) — slow path
 */
export function isD1Configured(): boolean {
  return !!(
    // Proxy path (preferred)
    (process.env.D1_PROXY_URL && process.env.D1_PROXY_SECRET) ||
    // Direct HTTP API path (fallback)
    (process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_D1_DATABASE_ID &&
      process.env.CLOUDFLARE_API_TOKEN)
  );
}
