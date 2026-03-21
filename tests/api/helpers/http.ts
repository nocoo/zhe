/**
 * HTTP helpers for API E2E tests.
 *
 * Provides a thin wrapper around `fetch()` that resolves the base URL
 * from the API_E2E_BASE_URL environment variable (set by run-api-e2e.ts).
 */

const BASE_URL = process.env.API_E2E_BASE_URL ?? 'http://localhost:17005';

/** Build an absolute URL from a path like `/api/health`. */
export function url(path: string): string {
  return `${BASE_URL}${path}`;
}

/** GET request to an API path. */
export async function apiGet(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(url(path), { headers });
}

/** POST request to an API path with JSON body. */
export async function apiPost(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** HEAD request to an API path. */
export async function apiHead(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(url(path), { method: 'HEAD', headers });
}

/** Parse JSON response and return both the parsed body and the Response. */
export async function jsonResponse<T = Record<string, unknown>>(
  res: Response,
): Promise<{ status: number; body: T; headers: Headers }> {
  const body = (await res.json()) as T;
  return { status: res.status, body, headers: res.headers };
}
