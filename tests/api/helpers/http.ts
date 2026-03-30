/**
 * HTTP helpers for API E2E tests.
 *
 * Provides a thin wrapper around `fetch()` that resolves the base URL
 * from the API_E2E_BASE_URL environment variable (set by run-api-e2e.ts).
 */

import { unwrap } from '../../test-utils';

const BASE_URL = process.env.API_E2E_BASE_URL ?? 'http://localhost:17006';

/** Build an absolute URL from a path like `/api/health`. */
export function url(path: string): string {
  return `${BASE_URL}${path}`;
}

/** GET request to an API path. */
export async function apiGet(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(url(path), {
    ...(headers !== undefined && { headers }),
  });
}

/** POST request to an API path with optional JSON body. */
export async function apiPost(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  const hasBody = body !== null && body !== undefined;
  return fetch(url(path), {
    method: 'POST',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(hasBody && { body: JSON.stringify(body) }),
  });
}

/** HEAD request to an API path. */
export async function apiHead(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(url(path), {
    method: 'HEAD',
    ...(headers !== undefined && { headers }),
  });
}

/** Parse JSON response and return both the parsed body and the Response. */
export async function jsonResponse<T = Record<string, unknown>>(
  res: Response,
): Promise<{ status: number; body: T; headers: Headers }> {
  const body = (await res.json()) as T;
  return { status: res.status, body, headers: res.headers };
}

// ---------------------------------------------------------------------------
// Auth helpers (for endpoints requiring session authentication)
// ---------------------------------------------------------------------------

let cachedSessionCookie: string | null = null;

/**
 * Authenticate via the e2e-credentials provider (enabled by PLAYWRIGHT=1 on
 * the dev server) and return the session cookie string.
 *
 * The cookie is cached for the lifetime of the test run to avoid
 * re-authenticating on every request.
 */
export async function getSessionCookie(): Promise<string> {
  if (cachedSessionCookie) return cachedSessionCookie;

  // Step 1: Get CSRF token (also sets a csrf cookie we need to forward)
  const csrfRes = await fetch(url('/api/auth/csrf'));
  const { csrfToken } = await csrfRes.json() as { csrfToken: string };

  // Extract the csrf cookie from the response to forward it
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const csrfCookieStr = csrfCookies
    .map((c: string) => unwrap(c.split(';')[0]))
    .join('; ');

  // Step 2: POST to credentials callback with csrf cookie and redirect: manual
  const callbackRes = await fetch(url('/api/auth/callback/e2e-credentials'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(csrfCookieStr ? { Cookie: csrfCookieStr } : {}),
    },
    body: new URLSearchParams({
      csrfToken,
      email: 'e2e@test.local',
      name: 'API E2E Test User',
    }),
    redirect: 'manual',
  });

  // Extract Set-Cookie header(s) — session token comes from the callback
  const cookies = callbackRes.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies
    .map((c: string) => unwrap(c.split(';')[0]))
    .filter((c: string) => c.startsWith('authjs.session-token=') || c.startsWith('__Secure-authjs.session-token='))
    .join('; ');

  if (!sessionCookie) {
    throw new Error(
      `Failed to obtain session cookie from e2e-credentials callback. ` +
      `Status: ${callbackRes.status}, cookies: ${cookies.join(', ')}`,
    );
  }

  cachedSessionCookie = sessionCookie;
  return sessionCookie;
}

/** GET request with session authentication. */
export async function apiGetAuth(path: string): Promise<Response> {
  const cookie = await getSessionCookie();
  return apiGet(path, { Cookie: cookie });
}

/** POST request with session authentication. */
export async function apiPostAuth(path: string, body: unknown): Promise<Response> {
  const cookie = await getSessionCookie();
  return apiPost(path, body, { Cookie: cookie });
}

// ---------------------------------------------------------------------------
// Worker secret auth helpers (for endpoints requiring WORKER_SECRET)
// ---------------------------------------------------------------------------

/** Build an Authorization Bearer header using the WORKER_SECRET env var. */
function workerAuthHeader(): Record<string, string> {
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error('WORKER_SECRET not set in test environment');
  return { Authorization: `Bearer ${secret}` };
}

/** POST request with WORKER_SECRET Bearer auth. */
export async function apiPostWorker(path: string, body: unknown): Promise<Response> {
  return apiPost(path, body, workerAuthHeader());
}
