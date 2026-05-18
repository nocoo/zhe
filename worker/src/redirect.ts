/**
 * Slug-redirect pipeline: KV lookup → origin lookup-API fallback. Extracted
 * from handleFetch so the main fetch handler stays small.
 */

import type { Env, KVLinkData } from './types';
import { forwardToOrigin } from './forward';
import { recordClickAsync } from './analytics';

/**
 * Try resolving the slug via the edge KV namespace.
 *   - Hit & not expired → 307 redirect + fire-and-forget analytics
 *   - Hit but expired   → forward to origin (real 404 page)
 *   - Miss              → return null (caller will fall through)
 *   - KV error          → log + return null
 */
export async function tryKvLookup(
  slug: string,
  ctx: ExecutionContext,
  env: Env,
  request: Request,
): Promise<Response | null> {
  try {
    const kvData = await env.LINKS_KV.get<KVLinkData>(slug, 'json');
    if (!kvData) return null;

    if (kvData.expiresAt && Date.now() > kvData.expiresAt) {
      return forwardToOrigin(request, env);
    }

    recordClickAsync(ctx, env, kvData.id, request);
    return Response.redirect(kvData.originalUrl, 307);
  } catch (err) {
    console.error(`KV lookup error for slug "${slug}":`, err);
    return null;
  }
}

interface LookupApiResponse {
  found: boolean;
  id?: number;
  originalUrl?: string;
  expiresAt?: number | null;
  expired?: boolean;
}

/** Fire-and-forget: backfill KV for future edge hits, honouring expiration. */
function backfillKv(
  ctx: ExecutionContext,
  env: Env,
  slug: string,
  data: LookupApiResponse,
): void {
  const kvValue = JSON.stringify({
    id: data.id,
    originalUrl: data.originalUrl,
    expiresAt: data.expiresAt ?? null,
  });
  const expirationSec =
    data.expiresAt != null ? Math.floor(data.expiresAt / 1000) : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const kvOptions =
    expirationSec != null && expirationSec > nowSec + 60
      ? { expiration: expirationSec }
      : undefined;
  ctx.waitUntil(env.LINKS_KV.put(slug, kvValue, kvOptions));
}

/** Cache a 404 origin response as a negative-cache tombstone (60s). */
async function tombstone404(
  originResponse: Response,
  ctx: ExecutionContext,
  cache: Cache,
  negCacheKey: Request,
): Promise<Response> {
  if (originResponse.status !== 404) return originResponse;
  const tomb = new Response(originResponse.body, {
    status: 404,
    headers: {
      ...Object.fromEntries(originResponse.headers.entries()),
      'Cache-Control': 'max-age=60',
    },
  });
  ctx.waitUntil(cache.put(negCacheKey, tomb.clone()));
  return tomb;
}

/**
 * KV miss → call origin /api/lookup. On 200/404 we trust the verdict:
 *   - found → 307 redirect + backfill KV
 *   - not found → forward to origin (404 page) + cache tombstone
 *   - 5xx / network error → return null so caller falls back to forwardToOrigin
 */
export async function tryOriginLookup(
  slug: string,
  url: URL,
  ctx: ExecutionContext,
  env: Env,
  request: Request,
  cache: Cache,
  negCacheKey: Request,
): Promise<Response | null> {
  try {
    const originBase = env.ORIGIN_URL.replace(/\/$/, '');
    const lookupRes = await fetch(
      `${originBase}/api/lookup?slug=${encodeURIComponent(slug)}`,
      { headers: { 'X-Forwarded-Host': url.hostname } },
    );

    if (!lookupRes.ok && lookupRes.status !== 404) return null;

    const lookupData = (await lookupRes.json()) as LookupApiResponse;

    if (lookupData.found && lookupData.originalUrl) {
      if (lookupData.id != null) {
        recordClickAsync(ctx, env, lookupData.id, request);
      }
      backfillKv(ctx, env, slug, lookupData);
      return Response.redirect(lookupData.originalUrl, 307);
    }

    if (!lookupData.found) {
      const originResponse = await forwardToOrigin(request, env);
      return tombstone404(originResponse, ctx, cache, negCacheKey);
    }

    return null;
  } catch (err) {
    console.error(`Lookup API error for slug "${slug}":`, err);
    return null;
  }
}
