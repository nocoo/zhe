/**
 * zhe-edge — Cloudflare Worker for zhe.to
 *
 * Full proxy for zhe.to — resolves short link redirects from KV at the edge,
 * forwards everything else (dashboard, API, static) to Railway origin.
 *
 * KV sync is handled by: (1) inline kvPutLink/kvDeleteLink on each mutation,
 * (2) a full D1 → KV sync on server startup, and (3) delta sync via Worker cron.
 *
 * Cron trigger (every 30 min):
 *   POST /api/cron/cleanup  → delete expired tmp files from R2
 *   POST /api/cron/sync-kv  → D1 → KV delta sync (skips if no mutations)
 *
 * Flow for incoming requests:
 *   ┌─────────────┐
 *   │  Request in  │
 *   └──────┬───────┘
 *          │
 *   ┌──────▼───────┐     yes    ┌──────────────────┐
 *   │ Static asset? ├──────────► │ Forward to origin │
 *   └──────┬───────┘            └──────────────────┘
 *          │ no
 *   ┌──────▼───────┐     yes    ┌──────────────────┐
 *   │ Reserved path?├──────────► │ Forward to origin │
 *   └──────┬───────┘            └──────────────────┘
 *          │ no
 *   ┌──────▼───────┐     yes    ┌────────────────────────────────┐
 *   │  Root path?   ├──────────► │ Forward to origin              │
 *   └──────┬───────┘            └────────────────────────────────┘
 *          │ no (potential slug)
 *   ┌──────▼───────┐   found   ┌──────────────┐
 *   │  KV lookup    ├─────────► │ 307 redirect │──► fire-and-forget analytics
 *   └──────┬───────┘           └──────────────┘
 *          │ not found / expired → forward to origin (404 page)
 *   ┌──────▼────────────┐
 *   │ Negative cache hit?├──yes──► Return cached 404 (origin-rendered)
 *   └──────┬────────────┘
 *          │ no
 *   ┌──────▼────────────────┐
 *   │ Lookup API (/api/lookup)│
 *   └──────┬────────────────┘
 *          ├── found → 307 redirect + KV backfill (with expiration)
 *          ├── not found → forward to origin (404 page) + neg cache tombstone
 *          └── error → forwardToOrigin (full fallback)
 */

import { handleD1Query, handleD1Batch } from "./d1-proxy";

export interface Env {
  LINKS_KV: KVNamespace;
  DB: D1Database;
  ORIGIN_URL: string;
  WORKER_SECRET: string;
  D1_PROXY_SECRET: string;
}

/** Minimal data stored per slug in KV — mirrors lib/kv/client.ts KVLinkData. */
interface KVLinkData {
  id: number;
  originalUrl: string;
  expiresAt: number | null; // epoch ms, null = never expires
}

// ─── Reserved Paths ─────────────────────────────────────────────────────────
// Must stay in sync with lib/constants.ts RESERVED_PATHS.

const RESERVED_PATHS = new Set([
  'login',
  'logout',
  'auth',
  'callback',
  'dashboard',
  'api',
  'admin',
  'live',
  '_next',
  'static',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

/** Check if the first path segment is a reserved path (exact or prefix match). */
function isReservedPath(segment: string): boolean {
  return RESERVED_PATHS.has(segment.toLowerCase());
}

// ─── Static Asset Detection ─────────────────────────────────────────────────
// Same extensions excluded by Next.js middleware matcher.

const STATIC_EXTENSIONS = new Set([
  '.png', '.ico', '.svg', '.jpg', '.jpeg', '.webp',
]);

function isStaticAsset(pathname: string): boolean {
  const dot = pathname.lastIndexOf('.');
  if (dot === -1) return false;
  return STATIC_EXTENSIONS.has(pathname.slice(dot).toLowerCase());
}

// ─── UA Parsing (mirrors lib/analytics.ts) ──────────────────────────────────

// Sub-modules — keeps this file focused on the fetch handler.
import { parseDevice, parseBrowser, parseOS, recordClickAsync } from './analytics';
import { forwardToOrigin } from './forward';

async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // 0. D1 proxy endpoints — MUST be checked BEFORE reserved path logic
  //    Otherwise /api/* gets forwarded to origin and these handlers never run
  if (pathname === '/api/d1-query' && request.method === 'POST') {
    return handleD1Query(request, env);
  }
  if (pathname === '/api/d1-batch' && request.method === 'POST') {
    return handleD1Batch(request, env);
  }

  // 1. Root path → forward to origin
  if (pathname === '/' || pathname === '') {
    return forwardToOrigin(request, env);
  }

  // 2. Static assets → forward to origin
  if (isStaticAsset(pathname)) {
    return forwardToOrigin(request, env);
  }

  // 3. Extract first path segment
  // split('/') always returns at least [''], so [0] is safe
  const slug = pathname.slice(1).split('/')[0] ?? '';

  // 4. Reserved paths → forward to origin
  if (isReservedPath(slug)) {
    return forwardToOrigin(request, env);
  }

  // 5. Multi-segment paths (e.g. /slug/something) → forward to origin
  //    Short links are single-segment only.
  if (pathname.slice(1).includes('/')) {
    return forwardToOrigin(request, env);
  }

  const cache = caches.default;
  const negCacheKey = new Request(`https://neg-cache.internal/${slug}`);

  // 6. KV lookup for potential slug
  try {
    const kvData = await env.LINKS_KV.get<KVLinkData>(slug, 'json');

    if (kvData) {
      // Check expiry — forward to origin so user sees the real 404 page
      if (kvData.expiresAt && Date.now() > kvData.expiresAt) {
        return forwardToOrigin(request, env);
      }

      // Fire-and-forget click analytics
      recordClickAsync(ctx, env, kvData.id, request);

      // 307 Temporary Redirect
      return Response.redirect(kvData.originalUrl, 307);
    }
  } catch (err) {
    console.error(`KV lookup error for slug "${slug}":`, err);
    // Fall through to negative cache / lookup API on KV error
  }

  // 6.5 Negative cache: check if this slug was recently confirmed as non-existent.
  // Placed AFTER KV lookup so a freshly-created slug in KV is never masked by a
  // stale tombstone from the same colo.
  const cached = await cache.match(negCacheKey);
  if (cached) {
    return cached;
  }

  // 7. Lightweight lookup via API (instead of full forwardToOrigin)
  try {
    const originBase = env.ORIGIN_URL.replace(/\/$/, '');
    const lookupRes = await fetch(
      `${originBase}/api/lookup?slug=${encodeURIComponent(slug)}`,
      { headers: { 'X-Forwarded-Host': url.hostname } },
    );

    // Only trust the response semantics for 200 and 404 (explicit hit/miss).
    // 500/other errors are transient — fall through to forwardToOrigin.
    if (lookupRes.ok || lookupRes.status === 404) {
      const lookupData = await lookupRes.json() as {
        found: boolean;
        id?: number;
        originalUrl?: string;
        expiresAt?: number | null;
        expired?: boolean;
      };

      if (lookupData.found && lookupData.originalUrl) {
        // D1 hit — redirect + analytics
        if (lookupData.id != null) {
          recordClickAsync(ctx, env, lookupData.id, request);
        }

        // Fire-and-forget: backfill KV for future edge hits (with native expiration)
        const kvValue = JSON.stringify({
          id: lookupData.id,
          originalUrl: lookupData.originalUrl,
          expiresAt: lookupData.expiresAt ?? null,
        });
        const expirationSec = lookupData.expiresAt != null
          ? Math.floor(lookupData.expiresAt / 1000)
          : null;
        const nowSec = Math.floor(Date.now() / 1000);
        const kvOptions = expirationSec != null && expirationSec > nowSec + 60
          ? { expiration: expirationSec }
          : undefined;
        ctx.waitUntil(env.LINKS_KV.put(slug, kvValue, kvOptions));

        return Response.redirect(lookupData.originalUrl, 307);
      }

      // Confirmed miss or expired — forward to origin for the real 404 page,
      // then cache the response as a negative cache tombstone
      if (!lookupData.found) {
        const originResponse = await forwardToOrigin(request, env);
        if (originResponse.status === 404) {
          const tombstone = new Response(originResponse.body, {
            status: 404,
            headers: {
              ...Object.fromEntries(originResponse.headers.entries()),
              'Cache-Control': 'max-age=60',
            },
          });
          ctx.waitUntil(cache.put(negCacheKey, tombstone.clone()));
          return tombstone;
        }
        return originResponse;
      }
    }
  } catch (err) {
    console.error(`Lookup API error for slug "${slug}":`, err);
    // Lookup API failed — fall through to forwardToOrigin as last resort
  }

  // 8. Fallback — full origin forward (only when lookup API itself fails)
  return forwardToOrigin(request, env);
}

// ─── Scheduled Handler (cron) ───────────────────────────────────────────────

/**
 * Called every 30 minutes by Cloudflare cron trigger.
 * Fires two parallel requests:
 *   1. POST /api/cron/cleanup  → delete expired tmp files from R2
 *   2. POST /api/cron/sync-kv  → D1 → KV delta sync (skips if no mutations)
 */
async function handleScheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const originBase = env.ORIGIN_URL.replace(/\/$/, '');

  // Cleanup expired tmp files from R2
  ctx.waitUntil(
    fetch(`${originBase}/api/cron/cleanup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WORKER_SECRET}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error(`Cleanup cron failed (${res.status}): ${text}`);
        } else {
          const data = await res.json().catch(() => ({}));
          console.log('Cleanup cron result:', JSON.stringify(data));
        }
      })
      .catch((err) => {
        console.error('Cleanup cron fetch error:', err);
      }),
  );

  // KV sync (D1 → KV delta)
  ctx.waitUntil(
    fetch(`${originBase}/api/cron/sync-kv`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WORKER_SECRET}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error(`Sync-kv cron failed (${res.status}): ${text}`);
        } else {
          const data = await res.json().catch(() => ({}));
          console.log('Sync-kv cron result:', JSON.stringify(data));
        }
      })
      .catch((err) => {
        console.error('Sync-kv cron fetch error:', err);
      }),
  );
}

// ─── Worker Export ──────────────────────────────────────────────────────────

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
