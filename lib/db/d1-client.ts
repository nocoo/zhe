/**
 * Shared D1 HTTP Client for Cloudflare D1 database access.
 * Used by both the main db module and Auth.js adapter.
 */

/** Timeout for D1 HTTP API requests (ms). Prevents hung fetches from blocking middleware indefinitely. */
const D1_FETCH_TIMEOUT_MS = 5_000;

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
 * Execute a SQL query against Cloudflare D1 via HTTP API.
 */
export async function executeD1Query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
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
 */
export function isD1Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_D1_DATABASE_ID &&
    process.env.CLOUDFLARE_API_TOKEN
  );
}
