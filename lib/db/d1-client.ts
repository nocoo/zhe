/**
 * D1 Client for Cloudflare D1 database access via Worker proxy.
 * Used by both the main db module and Auth.js adapter.
 *
 * All queries route through the Worker D1 proxy (D1_PROXY_URL + D1_PROXY_SECRET).
 * The proxy uses native D1 binding at the edge, providing 10-100x faster queries
 * than the deprecated HTTP API path.
 */

/** Timeout for Worker proxy requests (ms). */
const PROXY_FETCH_TIMEOUT_MS = 3_000;

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

/** Request/response format for batch endpoint. */
interface D1BatchRequest {
  statements: Array<{ sql: string; params?: unknown[] }>;
}

interface D1BatchResponse {
  success: boolean;
  results?: Array<{ results: unknown[]; meta: { changes: number; last_row_id: number } }>;
  error?: string;
}

/** A single SQL statement with optional parameters. */
export interface D1Statement {
  sql: string;
  params?: unknown[];
}

/** Check if Worker D1 proxy credentials are configured. */
function getProxyCredentials(): { url: string; secret: string } {
  const url = process.env.D1_PROXY_URL;
  const secret = process.env.D1_PROXY_SECRET;

  if (!url || !secret) {
    throw new Error('D1 proxy not configured. Set D1_PROXY_URL and D1_PROXY_SECRET.');
  }

  return { url, secret };
}

/**
 * Execute a SQL query against Cloudflare D1 via Worker proxy.
 *
 * Error contract:
 * - UNIQUE constraint errors → "UNIQUE constraint failed" (for caller detection)
 * - All other errors → "D1 query failed" (sanitized)
 */
export async function executeD1Query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { url, secret } = getProxyCredentials();
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

/**
 * Execute multiple SQL statements in a single atomic batch.
 * Uses D1's native batch() API — all statements succeed or all fail.
 *
 * Returns an array of result arrays, one per statement.
 */
export async function executeD1Batch<T>(statements: D1Statement[]): Promise<T[][]> {
  if (statements.length === 0) {
    return [];
  }

  const { url, secret } = getProxyCredentials();
  const endpoint = url.endsWith('/') ? `${url}api/d1-batch` : `${url}/api/d1-batch`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ statements } satisfies D1BatchRequest),
    signal: AbortSignal.timeout(PROXY_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Worker proxy HTTP error (batch):', error);
    throw new Error('D1 batch failed');
  }

  const data: D1BatchResponse = await response.json();

  if (!data.success) {
    console.error('Worker proxy batch error:', data.error);
    throw new Error(data.error || 'D1 batch failed');
  }

  return (data.results || []).map(r => r.results as T[]);
}

/**
 * Check if D1 is configured and available.
 * D1 requires Worker proxy credentials (D1_PROXY_URL + D1_PROXY_SECRET).
 */
export function isD1Configured(): boolean {
  return !!(process.env.D1_PROXY_URL && process.env.D1_PROXY_SECRET);
}
