/**
 * Unit tests for zhe-edge Cloudflare Worker.
 *
 * Tests the Worker's fetch handler by mocking KV, ExecutionContext,
 * and the origin fetch. Covers:
 * - Reserved path forwarding
 * - Static asset forwarding
 * - Root path forwarding
 * - KV hit → 307 redirect + analytics
 * - KV hit with expired link → forward to origin
 * - KV miss → forward to origin
 * - KV error → forward to origin
 * - Multi-segment paths → forward to origin
 * - Cron scheduled handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Types ─────────────────────────────────────────────────────────────

interface MockKV {
  get: ReturnType<typeof vi.fn>;
}

interface MockEnv {
  LINKS_KV: MockKV;
  ORIGIN_URL: string;
  CRON_SECRET: string;
  INTERNAL_API_SECRET?: string;
}

interface MockCtx {
  waitUntil: ReturnType<typeof vi.fn>;
}

// ─── Import Worker (dynamic to allow global fetch mock) ─────────────────────

let worker: {
  fetch: (request: Request, env: MockEnv, ctx: MockCtx) => Promise<Response>;
  scheduled: (event: unknown, env: MockEnv, ctx: MockCtx) => void;
};

beforeEach(async () => {
  vi.restoreAllMocks();
  // Dynamic import to pick up fresh module state
  const mod = await import('../src/index.js');
  worker = mod.default as unknown as typeof worker;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEnv(overrides?: Partial<MockEnv>): MockEnv {
  return {
    LINKS_KV: { get: vi.fn().mockResolvedValue(null) },
    ORIGIN_URL: 'https://zhe-origin.railway.app',
    CRON_SECRET: 'test-cron-secret',
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

    it('sets Host header to origin host', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      await worker.fetch(makeRequest('/dashboard'), env, makeCtx());

      const [, opts] = fetchMock.mock.calls[0];
      const headers = opts.headers as Headers;
      expect(headers.get('Host')).toBe('zhe-origin.railway.app');
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
      const env = makeEnv({ INTERNAL_API_SECRET: 'test-secret' });
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
      expect(headers['x-internal-secret']).toBe('test-secret');

      const body = JSON.parse(opts.body as string);
      expect(body.linkId).toBe(99);
      expect(body.device).toBe('mobile');
      expect(body.browser).toBe('Safari');
      expect(body.os).toBe('iOS');
      expect(body.country).toBe('SG');
      expect(body.referer).toBe('https://twitter.com');
    });

    it('forwards expired link to origin (shows not-found)', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue({
        id: 1,
        originalUrl: 'https://expired.example.com',
        expiresAt: Date.now() - 60_000, // expired 1 min ago
      });

      const res = await worker.fetch(makeRequest('/expired'), env, makeCtx());

      // Should forward to origin, not redirect
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
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

    it('forwards to origin when KV returns null (miss)', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      env.LINKS_KV.get.mockResolvedValue(null);

      const res = await worker.fetch(makeRequest('/unknown'), env, makeCtx());

      expect(env.LINKS_KV.get).toHaveBeenCalledWith('unknown', 'json');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
    });

    it('forwards to origin when KV throws an error', async () => {
      const fetchMock = stubOriginFetch();
      const env = makeEnv();
      env.LINKS_KV.get.mockRejectedValue(new Error('KV unavailable'));

      const res = await worker.fetch(makeRequest('/broken'), env, makeCtx());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
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

describe('zhe-edge Worker — scheduled handler', () => {
  it('calls /api/cron/sync-kv with correct auth', async () => {
    const fetchMock = stubOriginFetch(200, JSON.stringify({ synced: 10, failed: 0 }));
    const env = makeEnv();
    const ctx = makeCtx();

    worker.scheduled({} as unknown, env, ctx);

    // The scheduled handler uses ctx.waitUntil
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);

    // Execute the promise
    await ctx.waitUntil.mock.calls[0][0];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://zhe-origin.railway.app/api/cron/sync-kv');
    expect(opts.method).toBe('POST');

    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-cron-secret');
  });

  it('does not throw when cron fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    const env = makeEnv();
    const ctx = makeCtx();

    worker.scheduled({} as unknown, env, ctx);

    // Should not throw
    await expect(ctx.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });
});
