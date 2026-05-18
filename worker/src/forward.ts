// ─── Origin Forwarding ──────────────────────────────────────────────────────

import type { Env } from './types';

/**
 * Forward a request to the Railway origin, preserving method, headers, and body.
 *
 * The Worker is a transparent proxy: the backend sees the original Host header
 * (e.g. zhe.to) unchanged, so NextAuth, request.url, and all host-dependent
 * logic work identically whether traffic arrives via Worker or directly.
 * ORIGIN_URL (e.g. https://origin.zhe.to) is used only to build the fetch
 * target URL — the Host header is NOT rewritten.
 */
export async function forwardToOrigin(request: Request, env: Env): Promise<Response> {
  const originBase = env.ORIGIN_URL.replace(/\/$/, '');
  const url = new URL(request.url);
  const target = `${originBase}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Forwarded-Host', url.hostname);
  headers.set('X-Real-Host', url.hostname);

  const cfCountry = request.headers.get('CF-IPCountry');
  const cfCity = (request as unknown as { cf?: { city?: string } }).cf?.city;
  if (cfCountry) headers.set('x-vercel-ip-country', cfCountry);
  if (cfCity) headers.set('x-vercel-ip-city', cfCity);

  return fetch(target, {
    method: request.method,
    headers,
    ...(request.method !== 'GET' && request.method !== 'HEAD' && { body: request.body }),
    redirect: 'manual',
  });
}
