// ─── Origin Forwarding ──────────────────────────────────────────────────────

import type { Env } from "./types";

/**
 * Forward a request to the origin, preserving method, headers, and body.
 *
 * The Worker is a transparent proxy: it keeps the incoming method, headers and
 * body, so NextAuth, request.url, and host-dependent logic read the same values
 * they would locally. Workers derive `Host` from the fetch target (so the origin
 * sees `origin.zhe.to`); the public hostname is carried in `X-Real-Host` and
 * `X-Forwarded-Host`. ORIGIN_URL is used only to build the fetch target URL.
 */
export async function forwardToOrigin(request: Request, env: Env): Promise<Response> {
  const originBase = env.ORIGIN_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const target = `${originBase}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Real-Host", url.hostname);

  const cfCountry = request.headers.get("CF-IPCountry");
  const cfCity = (request as unknown as { cf?: { city?: string } }).cf?.city;
  if (cfCountry) headers.set("x-vercel-ip-country", cfCountry);
  if (cfCity) headers.set("x-vercel-ip-city", cfCity);

  return fetch(target, {
    method: request.method,
    headers,
    ...(request.method !== "GET" && request.method !== "HEAD" && { body: request.body }),
    redirect: "manual",
  });
}
