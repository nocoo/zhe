/**
 * HTTP helpers for API E2E tests.
 *
 * Provides a thin wrapper around `fetch()` that resolves the base URL
 * from the API_E2E_BASE_URL environment variable (set by run-api-e2e.ts).
 */

import assert from "node:assert/strict";

const BASE_URL = process.env.API_E2E_BASE_URL ?? "http://localhost:17006";

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

/** PUT request to an API path with optional JSON body. */
export async function apiPut(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  const hasBody = body !== null && body !== undefined;
  return fetch(url(path), {
    method: "PUT",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(hasBody && { body: JSON.stringify(body) }),
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
    method: "POST",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(hasBody && { body: JSON.stringify(body) }),
  });
}

/** HEAD request to an API path. */
export async function apiHead(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(url(path), {
    method: "HEAD",
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

export async function getSessionCookie(): Promise<string> {
  assert.equal(BASE_URL, `http://localhost:${Number(process.env.ZHE_TEST_APP_PORT ?? 17006)}`);
  if (cachedSessionCookie) return cachedSessionCookie;
  const token = process.env.ZHE_LOCAL_AUTH_TOKEN;
  assert(token);
  const csrf = await apiGet("/api/auth/csrf");
  assert.equal(csrf.status, 200);
  const { csrfToken } = await csrf.json();
  const response = await fetch(url("/api/auth/callback/local-fixture"), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrf.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
    },
    body: new URLSearchParams({ csrfToken, token, callbackUrl: BASE_URL }),
  });
  cachedSessionCookie = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((cookie) => cookie?.startsWith("authjs.session-token"))
    .join("; ");
  assert(cachedSessionCookie, "Auth.js did not issue a fixture session");
  return cachedSessionCookie;
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

/** PUT request with session authentication. */
export async function apiPutAuth(path: string, body: unknown): Promise<Response> {
  const cookie = await getSessionCookie();
  return apiPut(path, body, { Cookie: cookie });
}

// ---------------------------------------------------------------------------
// Worker secret auth helpers (for endpoints requiring WORKER_SECRET)
// ---------------------------------------------------------------------------

/** Build an Authorization Bearer header using the WORKER_SECRET env var. */
function workerAuthHeader(): Record<string, string> {
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error("WORKER_SECRET not set in test environment");
  return { Authorization: `Bearer ${secret}` };
}

/** POST request with WORKER_SECRET Bearer auth. */
export async function apiPostWorker(path: string, body: unknown): Promise<Response> {
  return apiPost(path, body, workerAuthHeader());
}
