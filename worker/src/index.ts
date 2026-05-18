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

// Sub-modules — keeps this file focused on the fetch handler.
import { forwardToOrigin } from './forward';
import { tryKvLookup, tryOriginLookup } from './redirect';

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

  // 1. Root path, static assets → forward to origin
  if (pathname === '/' || pathname === '' || isStaticAsset(pathname)) {
    return forwardToOrigin(request, env);
  }

  // 2. Extract first path segment; reserved + multi-segment → forward to origin
  const slug = pathname.slice(1).split('/')[0] ?? '';
  if (isReservedPath(slug) || pathname.slice(1).includes('/')) {
    return forwardToOrigin(request, env);
  }

  // 3. KV lookup for potential slug
  const kvResult = await tryKvLookup(slug, ctx, env, request);
  if (kvResult) return kvResult;

  // 4. Negative cache: a recent confirmed 404 for this slug.
  //    Placed AFTER KV lookup so a freshly-created slug is never masked by a
  //    stale tombstone from the same colo.
  const cache = caches.default;
  const negCacheKey = new Request(`https://neg-cache.internal/${slug}`);
  const cached = await cache.match(negCacheKey);
  if (cached) return cached;

  // 5. Lightweight lookup via origin API (cheaper than full forward).
  const apiResult = await tryOriginLookup(slug, url, ctx, env, request, cache, negCacheKey);
  if (apiResult) return apiResult;

  // 6. Fallback — full origin forward (only when lookup API itself fails)
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
