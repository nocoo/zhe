/**
 * Unit tests for zhe-edge Cloudflare Worker.
 *
 * Tests the Worker's fetch handler by mocking KV, ExecutionContext,
 * Cache API, and the origin fetch. Covers:
 * - Reserved path forwarding
 * - Static asset forwarding
 * - Root path forwarding
 * - KV hit → 307 redirect + analytics
 * - KV hit with expired link → direct 404 at edge (no origin forward)
 * - KV miss → lookup API → 307 redirect + KV backfill
 * - KV miss → lookup API miss → 404 + negative cache tombstone
 * - KV error → lookup API fallback → forwardToOrigin
 * - Negative cache hit → cached 404
 * - Multi-segment paths → forward to origin
 * - Scheduled handler (cron) → POST /api/cron/cleanup + POST /api/cron/sync-kv on origin
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Types ─────────────────────────────────────────────────────────────

interface MockKV {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

interface MockEnv {
  LINKS_KV: MockKV;
  ORIGIN_URL: string;
  WORKER_SECRET: string;
}

interface MockCtx {
  waitUntil: ReturnType<typeof vi.fn>;
}

interface MockScheduledController {
  scheduledTime: number;
  cron: string;
  noRetry: ReturnType<typeof vi.fn>;
}

// ─── Cache API Mock ─────────────────────────────────────────────────────────

const mockCache = {
  match: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
};

Object.defineProperty(globalThis, 'caches', {
  value: { default: mockCache },
  writable: true,
  configurable: true,
});

// ─── Import Worker (dynamic to allow global fetch mock) ─────────────────────

let worker: {
  fetch: (request: Request, env: MockEnv, ctx: MockCtx) => Promise<Response>;
  scheduled: (controller: MockScheduledController, env: MockEnv, ctx: MockCtx) => Promise<void>;
};

beforeEach(async () => {
  vi.restoreAllMocks();
  mockCache.match.mockReset().mockResolvedValue(undefined);
  mockCache.put.mockReset().mockResolvedValue(undefined);
  // Dynamic import to pick up fresh module state
  const mod = await import('../src/index.js');
  worker = mod.default as unknown as typeof worker;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEnv(overrides?: Partial<MockEnv>): MockEnv {
  return {
    LINKS_KV: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    ORIGIN_URL: 'https://zhe-origin.railway.app',
    WORKER_SECRET: 'test-worker-secret',
    ...overrides,
  };
}

function makeCtx(): MockCtx {
  return { waitUntil: vi.fn() };
}

function makeRequest(path: string, options?: RequestInit): Request {
  return new Request(`https://zhe.to${path}`, options);
}

/** Stub global fetch to return a mock origin response. */
function stubOriginFetch(status = 200, body = 'origin response') {
  const mockFn = vi.fn().mockResolvedValue(new Response(body, { status }));
  globalThis.fetch = mockFn;
  return mockFn;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('zhe-edge Worker — fetch handler', () => {
  describe('forwarding to origin', () => {
    it('forwards root path / to origin', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      const res = await worker.fetch(makeRequest('/'), env, makeCtx());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://zhe-origin.railway.app/');
      expect(res.status).toBe(200);
    });

    it.each([
      '/dashboard', '/dashboard/links', '/api/health', '/api/cron/sync-kv',
      '/auth/callback', '/login', '/logout', '/admin', '/live',
      '/_next/static/chunk.js', '/static/logo.png',
      '/favicon.ico', '/robots.txt', '/sitemap.xml',
    ])('forwards reserved path %s to origin', async (path) => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      const res = await worker.fetch(makeRequest(path), env, makeCtx());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
    });

    it.each(['.png', '.ico', '.svg', '.jpg', '.jpeg', '.webp'])(
      'forwards static asset with extension %s to origin',
      async (ext) => {
        const fetchMock = stubOriginFetch();
        const env = makeEnv();
        const res = await worker.fetch(makeRequest(`/image${ext}`), env, makeCtx());

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(200);
      },
    );

    it('forwards multi-segment paths to origin (e.g. /slug/extra)', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      const res = await worker.fetch(makeRequest('/abc/extra'), env, makeCtx());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
    });

    it('preserves query string when forwarding to origin', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/dashboard?tab=links'), env, makeCtx());

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://zhe-origin.railway.app/dashboard?tab=links');
    });

    it('does NOT rewrite Host header (transparent proxy)', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/dashboard'), env, makeCtx());

      const [, opts] = fetchMock.mock.calls[0];
      const headers = opts.headers as Headers;
      // Worker must NOT explicitly set Host to origin host.
      // In the real CF Worker runtime, the original Host (zhe.to) from
      // `new Headers(request.headers)` is preserved and sent to origin.
      // In Node/Bun test env, Host is a forbidden header and gets stripped,
      // so we verify it's NOT set to the origin host (which would mean rewriting).
      expect(headers.get('Host')).not.toBe('zhe-origin.railway.app');
    });

    it('sets X-Forwarded-Host to original public hostname', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/dashboard'), env, makeCtx());

      const [, opts] = fetchMock.mock.calls[0];
      const headers = opts.headers as Headers;
      // Worker must set X-Forwarded-Host to the original hostname (zhe.to)
      // so Railway's proxy cannot overwrite it with origin.zhe.to.
      expect(headers.get('X-Forwarded-Host')).toBe('zhe.to');
    });

    it('sets X-Real-Host to original public hostname (Railway-safe)', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/dashboard'), env, makeCtx());

      const [, opts] = fetchMock.mock.calls[0];
      const headers = opts.headers as Headers;
      // X-Real-Host is a custom header that Railway's reverse proxy will not
      // overwrite, ensuring the origin can always recover the real public host.
      expect(headers.get('X-Real-Host')).toBe('zhe.to');
    });

    it('uses redirect: manual to pass through origin redirects', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/'), env, makeCtx());

      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.redirect).toBe('manual');
    });
  });

  describe('KV redirect', () => {
    it('returns 307 redirect when KV has matching slug', async () => {
      stubOriginFetch(); // for analytics call
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue({
        id: 42,
        originalUrl: 'https://example.com/target',
        expiresAt: null,
      });

      const res = await worker.fetch(makeRequest('/abc'), env, makeCtx());

      expect(env.LINKS_KV.get).toHaveBeenCalledWith('abc', 'json');
      expect(res.status).toBe(307);
      expect(res.headers.get('Location')).toMatch(/^https:\/\/example\.com\/target\/?$/);
    });

    it('fires analytics via waitUntil on KV hit', async () => {
      stubOriginFetch();
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue({
        id: 42,
        originalUrl: 'https://example.com/target',
        expiresAt: null,
      });
      const ctx = makeCtx();

      await worker.fetch(
        makeRequest('/abc', {
          headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' },
        }),
        env,
        ctx,
      );

      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    });

    it('sends correct analytics payload to /api/record-click', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue({
        id: 99,
        originalUrl: 'https://example.com',
        expiresAt: null,
      });
      const ctx = makeCtx();

      await worker.fetch(
        makeRequest('/slug', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Safari/604',
            'CF-IPCountry': 'SG',
            'referer': 'https://twitter.com',
          },
        }),
        env,
        ctx,
      );

      // Execute the waitUntil promise
      const waitUntilPromise = ctx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      // Find the analytics call (not the origin forward)
      const analyticsCall = fetchMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/api/record-click'),
      );
      expect(analyticsCall).toBeDefined();

      const [url, opts] = analyticsCall!;
      expect(url).toBe('https://zhe-origin.railway.app/api/record-click');
      expect(opts.method).toBe('POST');

      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-worker-secret');

      const body = JSON.parse(opts.body as string);
      expect(body.linkId).toBe(99);
      expect(body.device).toBe('mobile');
      expect(body.browser).toBe('Safari');
      expect(body.os).toBe('iOS');
      expect(body.country).toBe('SG');
      expect(body.referer).toBe('https://twitter.com');
    });

    it('returns 404 directly for expired KV hit (no origin forward)', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue({
        id: 1,
        originalUrl: 'https://expired.example.com',
        expiresAt: Date.now() - 60_000, // expired 1 min ago
      });

      const res = await worker.fetch(makeRequest('/expired'), env, makeCtx());

      // Should return 404 directly at the edge, NOT forward to origin
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });

    it('does NOT expire link when expiresAt is in the future', async () => {
      stubOriginFetch();
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue({
        id: 1,
        originalUrl: 'https://valid.example.com',
        expiresAt: Date.now() + 3_600_000, // 1 hour from now
      });

      const res = await worker.fetch(makeRequest('/valid'), env, makeCtx());

      expect(res.status).toBe(307);
      // Response.redirect normalizes URL (may append trailing slash)
      expect(res.headers.get('Location')).toMatch(/^https:\/\/valid\.example\.com\/?$/);
    });

    it('calls lookup API on KV miss and redirects on hit', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          found: true,
          id: 7,
          originalUrl: 'https://from-lookup.com',
          expiresAt: null,
        }), { status: 200 }),
      );
      globalThis.fetch = fetchMock;
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue(null);

      const res = await worker.fetch(makeRequest('/unknown'), env, makeCtx());

      expect(env.LINKS_KV.get).toHaveBeenCalledWith('unknown', 'json');
      // Should call lookup API
      const lookupCall = fetchMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/api/lookup'),
      );
      expect(lookupCall).toBeDefined();
      expect(lookupCall![0]).toContain('/api/lookup?slug=unknown');
      // Should 307 redirect from lookup hit
      expect(res.status).toBe(307);
      expect(res.headers.get('Location')).toMatch(/^https:\/\/from-lookup\.com\/?$/);
    });

    it('backfills KV on lookup API hit', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          found: true,
          id: 7,
          originalUrl: 'https://from-lookup.com',
          expiresAt: 1800000000000,
        }), { status: 200 }),
      );
      globalThis.fetch = fetchMock;
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue(null);
      const ctx = makeCtx();

      await worker.fetch(makeRequest('/backfill'), env, ctx);

      // waitUntil should be called for both analytics and KV backfill
      expect(ctx.waitUntil).toHaveBeenCalled();
      // Verify KV put was called via waitUntil (KV backfill)
      const waitUntilArgs = ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]);
      await Promise.all(waitUntilArgs);
      expect(env.LINKS_KV.put).toHaveBeenCalledWith(
        'backfill',
        JSON.stringify({ id: 7, originalUrl: 'https://from-lookup.com', expiresAt: 1800000000000 }),
      );
    });

    it('returns 404 and writes tombstone on lookup API miss', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ found: false }), { status: 404 }),
      );
      globalThis.fetch = fetchMock;
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue(null);
      const ctx = makeCtx();

      const res = await worker.fetch(makeRequest('/nonexist'), env, ctx);

      expect(res.status).toBe(404);
      // Should write tombstone via cache.put
      await Promise.all(ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]));
      expect(mockCache.put).toHaveBeenCalledTimes(1);
      const [cacheKey, tombstone] = mockCache.put.mock.calls[0];
      expect(cacheKey.url).toBe('https://neg-cache.internal/nonexist');
      expect(tombstone.status).toBe(404);
      expect(tombstone.headers.get('Cache-Control')).toBe('max-age=60');
    });

    it('does not write tombstone on lookup API error', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'DB error' }), { status: 500 }),
      );
      globalThis.fetch = fetchMock;
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue(null);

      await worker.fetch(makeRequest('/dberr'), env, makeCtx());

      // Should fall back to forwardToOrigin — fetch called twice (lookup + forward)
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Should NOT write tombstone
      expect(mockCache.put).not.toHaveBeenCalled();
    });

    it('falls back to forwardToOrigin when KV error and lookup API fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error('Lookup network error')) // lookup API fails
        .mockResolvedValueOnce(new Response('origin', { status: 200 })); // forwardToOrigin succeeds
      globalThis.fetch = fetchMock;
      const env = makeEnv();
      env.LINKS_KV.get.mockRejectedValue(new Error('KV unavailable'));

      const res = await worker.fetch(makeRequest('/broken'), env, makeCtx());

      // Should fall through to forwardToOrigin
      expect(res.status).toBe(200);
      consoleSpy.mockRestore();
    });
  });

  describe('reserved path detection (case-insensitive)', () => {
    it('treats Dashboard (mixed case) as reserved', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/Dashboard'), env, makeCtx());

      expect(env.LINKS_KV.get).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('treats API (uppercase) as reserved', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/API/health'), env, makeCtx());

      expect(env.LINKS_KV.get).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('negative cache', () => {
    it('returns cached 404 when negative cache has tombstone for slug', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      // Simulate cache hit
      mockCache.match.mockResolvedValueOnce(
        new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'max-age=60' } }),
      );

      const res = await worker.fetch(makeRequest('/cached-miss'), env, makeCtx());

      // Should return cached 404 without calling KV or fetch
      expect(res.status).toBe(404);
      expect(env.LINKS_KV.get).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('tombstone includes Cache-Control max-age=60', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ found: false }), { status: 404 }),
      );
      globalThis.fetch = fetchMock;
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue(null);
      const ctx = makeCtx();

      await worker.fetch(makeRequest('/tomb-test'), env, ctx);

      await Promise.all(ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]));
      expect(mockCache.put).toHaveBeenCalledTimes(1);
      const [, tombstone] = mockCache.put.mock.calls[0];
      expect(tombstone.headers.get('Cache-Control')).toBe('max-age=60');
    });
  });

  describe('geo header passthrough', () => {
    it('maps CF-IPCountry to x-vercel-ip-country for origin', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(
        makeRequest('/dashboard', {
          headers: { 'CF-IPCountry': 'JP' },
        }),
        env,
        makeCtx(),
      );

      const [, opts] = fetchMock.mock.calls[0];
      const headers = opts.headers as Headers;
      expect(headers.get('x-vercel-ip-country')).toBe('JP');
    });
  });
});

// ─── Scheduled Handler Tests ────────────────────────────────────────────────

function makeScheduledController(): MockScheduledController {
  return {
    scheduledTime: Date.now(),
    cron: '*/30 * * * *',
    noRetry: vi.fn(),
  };
}

describe('zhe-edge Worker — scheduled handler', () => {
  it('calls both cleanup and sync-kv with Bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    const env = makeEnv();
    const ctx = makeCtx();
    await worker.scheduled(makeScheduledController(), env, ctx);

    // Should have two waitUntil calls (cleanup + sync-kv)
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);

    // Execute both waitUntil promises
    await Promise.all(ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]));

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const urls = fetchMock.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(urls).toContain('https://zhe-origin.railway.app/api/cron/cleanup');
    expect(urls).toContain('https://zhe-origin.railway.app/api/cron/sync-kv');

    // Both should have Bearer auth
    for (const call of fetchMock.mock.calls) {
      const opts = call[1] as { method: string; headers: Record<string, string> };
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe('Bearer test-worker-secret');
    }
  });

  it('logs error when cleanup endpoint returns non-200', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/cleanup')) {
        return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    globalThis.fetch = fetchMock;

    const env = makeEnv();
    const ctx = makeCtx();
    await worker.scheduled(makeScheduledController(), env, ctx);

    await Promise.all(ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup cron failed (500)'),
    );
  });

  it('does not throw when cleanup fetch fails (network error)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/cleanup')) {
        return Promise.reject(new Error('Network unreachable'));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    globalThis.fetch = fetchMock;

    const env = makeEnv();
    const ctx = makeCtx();
    await worker.scheduled(makeScheduledController(), env, ctx);

    await Promise.all(ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Cleanup cron fetch error:',
      expect.any(Error),
    );
  });

  it('logs error when sync-kv endpoint returns non-200', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/sync-kv')) {
        return Promise.resolve(new Response('Service Unavailable', { status: 503 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    globalThis.fetch = fetchMock;

    const env = makeEnv();
    const ctx = makeCtx();
    await worker.scheduled(makeScheduledController(), env, ctx);

    await Promise.all(ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Sync-kv cron failed (503)'),
    );
  });

  it('handles network error for sync-kv gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/sync-kv')) {
        return Promise.reject(new Error('Connection refused'));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    globalThis.fetch = fetchMock;

    const env = makeEnv();
    const ctx = makeCtx();
    await worker.scheduled(makeScheduledController(), env, ctx);

    await Promise.all(ctx.waitUntil.mock.calls.map((call: unknown[]) => call[0]));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Sync-kv cron fetch error:',
      expect.any(Error),
    );
  });
});

