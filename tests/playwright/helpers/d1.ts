/**
 * Shared D1 helpers for Playwright global setup/teardown.
 *
 * Talks to the local wrangler dev proxy on 127.0.0.1:8788 (see
 * scripts/test-stack.ts). No remote Cloudflare HTTP API calls.
 */

/** E2E test user — must match the CredentialsProvider in auth.ts. */
export const TEST_USER = {
  id: 'e2e-test-user-id',
  name: 'E2E Test User',
  email: 'e2e@test.local',
} as const;

export interface ExecuteD1Options {
  /** When true, log warnings instead of throwing on missing config / errors. */
  softFail?: boolean;
}

function proxyCredentials(softFail = false): { url: string; secret: string } | null {
  const url = process.env.D1_PROXY_URL;
  const secret = process.env.D1_PROXY_SECRET;
  if (!url || !secret) {
    const msg = 'D1_PROXY_URL / D1_PROXY_SECRET not set. Playwright globalSetup must call applyLocalStackEnv() first.';
    if (softFail) {
      console.warn(`[pw:d1] ${msg}`);
      return null;
    }
    throw new Error(msg);
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error(
      `D1_PROXY_URL must point to the local wrangler dev (127.0.0.1/localhost). Got: ${url}. ` +
      'Refusing to run destructive operations against a remote target.',
    );
  }
  return { url, secret };
}

function endpoint(base: string, path: string): string {
  return base.endsWith('/') ? `${base}${path.replace(/^\//, '')}` : `${base}${path}`;
}

interface D1QueryResponse {
  success: boolean;
  results?: unknown[];
  error?: string;
}

/**
 * Execute a SQL query against D1 via the local worker proxy.
 *
 * Uses the same /api/d1-query endpoint the application calls in production,
 * so test setup/teardown exercises the proxy path end-to-end.
 */
export async function executeD1(
  sql: string,
  params: unknown[] = [],
  options: ExecuteD1Options = {},
): Promise<void> {
  const creds = proxyCredentials(options.softFail);
  if (!creds) return;

  const res = await fetch(endpoint(creds.url, '/api/d1-query'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const body = await res.text();
    const msg = `D1 proxy HTTP error ${res.status}: ${body}`;
    if (options.softFail) {
      console.error(`[pw:d1] ${msg}`);
      return;
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as D1QueryResponse;
  if (!data.success) {
    const msg = `D1 proxy error: ${data.error ?? 'unknown'}`;
    if (options.softFail) {
      console.error(`[pw:d1] ${msg}`);
      return;
    }
    throw new Error(msg);
  }
}

/** Execute a SELECT via the local worker proxy and return rows. */
export async function queryD1<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const creds = proxyCredentials();
  if (!creds) throw new Error('proxyCredentials() returned null with softFail off');

  const res = await fetch(endpoint(creds.url, '/api/d1-query'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`D1 proxy HTTP error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as D1QueryResponse;
  if (!data.success) {
    throw new Error(`D1 proxy error: ${data.error ?? 'unknown'}`);
  }

  return (data.results ?? []) as T[];
}
