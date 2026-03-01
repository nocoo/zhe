/**
 * zhe-edge — Cloudflare Worker for zhe.to
 *
 * Two responsibilities:
 * 1. FETCH: Full proxy for zhe.to — resolves short link redirects from KV at
 *    the edge, forwards everything else (dashboard, API, static) to Railway origin.
 * 2. SCHEDULED: Cron trigger every hour to call /api/cron/sync-kv on origin,
 *    keeping KV in sync with D1 without needing an external scheduler.
 *    Uses delta sync: skips if no changes since last sync.
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
 *          │ not found
 *   ┌──────▼───────────┐
 *   │ Forward to origin │  (middleware handles D1 fallback)
 *   └─────────────────┘
 */

export interface Env {
  LINKS_KV: KVNamespace;
  ORIGIN_URL: string;
  WORKER_SECRET: string;
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

function parseDevice(ua: string): string {
  if (!ua) return 'unknown';
  const lower = ua.toLowerCase();
  if (lower.includes('ipad') || lower.includes('tablet') ||
      (lower.includes('android') && !lower.includes('mobile'))) return 'tablet';
  if (lower.includes('mobile') || lower.includes('iphone') || lower.includes('ipod') ||
      lower.includes('android') || lower.includes('blackberry') || lower.includes('windows phone')) return 'mobile';
  if (lower.includes('windows') || lower.includes('macintosh') ||
      lower.includes('linux') || lower.includes('x11')) return 'desktop';
  return 'unknown';
}

function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  if (ua.includes('Chrome/') && !ua.includes('Chromium/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('MSIE') || ua.includes('Trident/')) return 'IE';
  if (ua.includes('Chromium/')) return 'Chromium';
  return 'Unknown';
}

function parseOS(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows NT 10')) return 'Windows 10';
  if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
  if (ua.includes('Windows NT 6.2')) return 'Windows 8';
  if (ua.includes('Windows NT 6.1')) return 'Windows 7';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS X')) return 'macOS';
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux';
  if (ua.includes('CrOS')) return 'Chrome OS';
  return 'Unknown';
}

// ─── Origin Forwarding ──────────────────────────────────────────────────────

/**
 * Forward a request to the Railway origin, preserving method, headers, and body.
 *
 * The Worker is a transparent proxy: the backend sees the original Host header
 * (e.g. zhe.to) unchanged, so NextAuth, request.url, and all host-dependent
 * logic work identically whether traffic arrives via Worker or directly.
 * ORIGIN_URL (e.g. https://origin.zhe.to) is used only to build the fetch
 * target URL — the Host header is NOT rewritten.
 */
async function forwardToOrigin(request: Request, env: Env): Promise<Response> {
  const originBase = env.ORIGIN_URL.replace(/\/$/, '');
  const url = new URL(request.url);
  const target = `${originBase}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  // Preserve original visitor IP for analytics/logging
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
  headers.set('X-Forwarded-Proto', 'https');
  // Explicitly set X-Forwarded-Host to the original public hostname so that
  // Railway's internal proxy cannot overwrite it with origin.zhe.to.
  // This is critical for NextAuth redirect_uri generation and post-auth redirects.
  headers.set('X-Forwarded-Host', url.hostname);
  // Railway's reverse proxy may overwrite X-Forwarded-Host with origin.zhe.to.
  // Use a custom header that Railway won't touch so the origin can always
  // recover the real public hostname (e.g. zhe.to).
  headers.set('X-Real-Host', url.hostname);
  // Pass Cloudflare geo headers for analytics (replaces Vercel geo headers)
  const cfCountry = request.headers.get('CF-IPCountry');
  const cfCity = (request as unknown as { cf?: { city?: string } }).cf?.city;
  if (cfCountry) headers.set('x-vercel-ip-country', cfCountry);
  if (cfCity) headers.set('x-vercel-ip-city', cfCity);

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual', // Don't follow origin redirects — pass them through
  });
}

// ─── Click Analytics (fire-and-forget) ──────────────────────────────────────

/**
 * Send a non-blocking click analytics event to the origin.
 * Uses ctx.waitUntil() so it doesn't delay the redirect response.
 */
function recordClickAsync(
  ctx: ExecutionContext,
  env: Env,
  linkId: number,
  request: Request,
): void {
  const ua = request.headers.get('user-agent') || '';
  const cfCountry = request.headers.get('CF-IPCountry');
  const cfCity = (request as unknown as { cf?: { city?: string } }).cf?.city || null;

  const body = {
    linkId,
    device: parseDevice(ua),
    browser: parseBrowser(ua),
    os: parseOS(ua),
    country: cfCountry || null,
    city: cfCity,
    referer: request.headers.get('referer') || null,
    source: 'worker',
  };

  const originBase = env.ORIGIN_URL.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.WORKER_SECRET}`,
  };

  ctx.waitUntil(
    fetch(`${originBase}/api/record-click`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }).catch((err) => {
      console.error('Failed to record click:', err);
    }),
  );
}

// ─── Fetch Handler ──────────────────────────────────────────────────────────

async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // 1. Root path → forward to origin
  if (pathname === '/' || pathname === '') {
    return forwardToOrigin(request, env);
  }

  // 2. Static assets → forward to origin
  if (isStaticAsset(pathname)) {
    return forwardToOrigin(request, env);
  }

  // 3. Extract first path segment
  const slug = pathname.slice(1).split('/')[0];

  // 4. Reserved paths → forward to origin
  if (isReservedPath(slug)) {
    return forwardToOrigin(request, env);
  }

  // 5. Multi-segment paths (e.g. /slug/something) → forward to origin
  //    Short links are single-segment only.
  if (pathname.slice(1).includes('/')) {
    return forwardToOrigin(request, env);
  }

  // 6. KV lookup for potential slug
  try {
    const kvData = await env.LINKS_KV.get<KVLinkData>(slug, 'json');

    if (kvData) {
      // Check expiry
      if (kvData.expiresAt && Date.now() > kvData.expiresAt) {
        // Expired — forward to origin (shows not-found page)
        return forwardToOrigin(request, env);
      }

      // Fire-and-forget click analytics
      recordClickAsync(ctx, env, kvData.id, request);

      // 307 Temporary Redirect
      return Response.redirect(kvData.originalUrl, 307);
    }
  } catch (err) {
    console.error(`KV lookup error for slug "${slug}":`, err);
    // Fall through to origin on KV error
  }

  // 7. KV miss or error → forward to origin (middleware D1 fallback)
  return forwardToOrigin(request, env);
}

// ─── Scheduled Handler (Cron) ───────────────────────────────────────────────

async function handleScheduled(env: Env): Promise<void> {
  const originBase = env.ORIGIN_URL.replace(/\/$/, '');
  const url = `${originBase}/api/cron/sync-kv`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WORKER_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json() as Record<string, unknown>;
    console.log(`Cron sync-kv: ${response.status}`, data);
  } catch (err) {
    console.error('Cron sync-kv failed:', err);
  }
}

// ─── Worker Export ──────────────────────────────────────────────────────────

export default {
  fetch: handleFetch,
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env));
  },
} satisfies ExportedHandler<Env>;
