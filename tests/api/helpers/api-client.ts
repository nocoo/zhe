/**
 * API client helpers for L2 E2E tests.
 */

/** Get the base URL for API requests. */
export function getBaseUrl(): string {
  const port = process.env.API_E2E_PORT ?? '17006';
  return `http://localhost:${port}`;
}

/** Make an authenticated fetch request with Bearer token. */
export async function authenticatedFetch(
  url: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${apiKey}`,
  };
  return fetch(url, { ...options, headers });
}
