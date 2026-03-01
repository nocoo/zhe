import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/constants', () => ({
  isReservedPath: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  extractClickMetadata: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getLinkBySlug: vi.fn(),
  recordClick: vi.fn(),
}));

import { middleware } from '@/middleware';
import { slugCache, getCachedSlug, setCachedSlug, SLUG_CACHE_TTL_MS, SLUG_CACHE_MAX } from '@/middleware';
import { auth } from '@/auth';
import { isReservedPath } from '@/lib/constants';
import { extractClickMetadata } from '@/lib/analytics';
import { getLinkBySlug, recordClick } from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://zhe.to';

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE));
}

function makeEvent() {
  return { waitUntil: vi.fn() } as unknown as import('next/server').NextFetchEvent;
}

const defaultMetadata = {
  device: 'desktop' as const,
  browser: 'Chrome',
  os: 'macOS',
  country: 'US',
  city: 'San Francisco',
  referer: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('middleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(extractClickMetadata).mockReturnValue(defaultMetadata);
    vi.mocked(recordClick).mockResolvedValue({} as never);
  });

  // 1. Root path ─────────────────────────────────────────────────────────────
  it('returns next() for root path', async () => {
    const res = await middleware(makeRequest('/'), makeEvent());

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(isReservedPath).not.toHaveBeenCalled();
    expect(getLinkBySlug).not.toHaveBeenCalled();
  });

  // 2. Reserved non-dashboard path ──────────────────────────────────────────
  it('returns next() for reserved non-dashboard paths', async () => {
    vi.mocked(isReservedPath).mockReturnValue(true);

    const res = await middleware(makeRequest('/api/something'), makeEvent());

    expect(isReservedPath).toHaveBeenCalledWith('api');
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(auth).not.toHaveBeenCalled();
  });

  // 3. Dashboard with no auth ───────────────────────────────────────────────
  it('redirects to login when dashboard is accessed without auth', async () => {
    vi.mocked(isReservedPath).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValue(null);

    const res = await middleware(makeRequest('/dashboard/links'), makeEvent());

    expect(auth).toHaveBeenCalled();
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/');
    expect(location.searchParams.get('callbackUrl')).toBe('/dashboard/links');
  });

  // 4. Dashboard with valid auth ────────────────────────────────────────────
  it('returns next() when dashboard is accessed with valid session', async () => {
    vi.mocked(isReservedPath).mockReturnValue(true);
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);

    const res = await middleware(makeRequest('/dashboard'), makeEvent());

    expect(auth).toHaveBeenCalled();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  // 5. Slug not found ──────────────────────────────────────────────────────
  it('rewrites to /not-found when slug does not exist', async () => {
    vi.mocked(isReservedPath).mockReturnValue(false);
    vi.mocked(getLinkBySlug).mockResolvedValue(null);

    const res = await middleware(makeRequest('/nonexistent'), makeEvent());

    expect(getLinkBySlug).toHaveBeenCalledWith('nonexistent');
    expect(res.headers.get('x-middleware-rewrite')).toContain('/not-found');
  });

  // 6. Expired link ─────────────────────────────────────────────────────────
  it('rewrites to /not-found when link is expired', async () => {
    vi.mocked(isReservedPath).mockReturnValue(false);
    vi.mocked(getLinkBySlug).mockResolvedValue({
      id: 1,
      slug: 'old',
      originalUrl: 'https://example.com',
      expiresAt: new Date('2020-01-01'),
      clicks: 0,
      userId: 'u1',
      folderId: null,
      isCustom: false,
      metaTitle: null,
      metaDescription: null,
      metaFavicon: null,
      screenshotUrl: null,
      note: null,
      createdAt: new Date('2019-01-01'),
    });

    const res = await middleware(makeRequest('/old'), makeEvent());

    expect(res.headers.get('x-middleware-rewrite')).toContain('/not-found');
  });

  // 7. Valid link redirects 307 ─────────────────────────────────────────────
  it('redirects to original URL with 307 for a valid link', async () => {
    vi.mocked(isReservedPath).mockReturnValue(false);
    vi.mocked(getLinkBySlug).mockResolvedValue({
      id: 42,
      slug: 'abc',
      originalUrl: 'https://example.com/target',
      expiresAt: null,
      clicks: 5,
      userId: 'u1',
      folderId: null,
      isCustom: true,
      metaTitle: null,
      metaDescription: null,
      metaFavicon: null,
      screenshotUrl: null,
      note: null,
      createdAt: new Date(),
    });

    const res = await middleware(makeRequest('/abc'), makeEvent());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://example.com/target');
  });

  // 8. Records click via waitUntil ──────────────────────────────────────────
  it('records click asynchronously via event.waitUntil', async () => {
    vi.mocked(isReservedPath).mockReturnValue(false);
    vi.mocked(getLinkBySlug).mockResolvedValue({
      id: 42,
      slug: 'abc',
      originalUrl: 'https://example.com/target',
      expiresAt: null,
      clicks: 5,
      userId: 'u1',
      folderId: null,
      isCustom: true,
      metaTitle: null,
      metaDescription: null,
      metaFavicon: null,
      screenshotUrl: null,
      note: null,
      createdAt: new Date(),
    });

    const event = makeEvent();
    await middleware(makeRequest('/abc'), event);

    expect(extractClickMetadata).toHaveBeenCalled();
    expect(event.waitUntil).toHaveBeenCalledTimes(1);

    // Resolve the promise passed to waitUntil so recordClick is invoked
    const waitUntilPromise = vi.mocked(event.waitUntil).mock.calls[0][0];
    await waitUntilPromise;

    expect(recordClick).toHaveBeenCalledWith({
      linkId: 42,
      device: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      country: 'US',
      city: 'San Francisco',
      referer: null,
      source: 'origin',
    });
  });

  // 9. Error during lookup ──────────────────────────────────────────────────
  it('rewrites to /not-found when getLinkBySlug throws', async () => {
    vi.mocked(isReservedPath).mockReturnValue(false);
    vi.mocked(getLinkBySlug).mockRejectedValue(new Error('DB down'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await middleware(makeRequest('/broken'), makeEvent());

    expect(res.headers.get('x-middleware-rewrite')).toContain('/not-found');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Middleware lookup error:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});

// ─── Slug cache unit tests ──────────────────────────────────────────────────

describe('slug cache', () => {
  beforeEach(() => {
    slugCache.clear();
  });

  afterEach(() => {
    slugCache.clear();
  });

  it('getCachedSlug returns undefined on cache miss', () => {
    expect(getCachedSlug('nonexistent')).toBeUndefined();
  });

  it('setCachedSlug + getCachedSlug round-trips a link', () => {
    const link = { id: 1, slug: 'abc', originalUrl: 'https://example.com' } as never;
    setCachedSlug('abc', link);
    expect(getCachedSlug('abc')).toBe(link);
  });

  it('setCachedSlug + getCachedSlug round-trips null (negative cache)', () => {
    setCachedSlug('missing', null);
    expect(getCachedSlug('missing')).toBeNull();
  });

  it('getCachedSlug returns undefined for expired entries', () => {
    setCachedSlug('old', { id: 1, slug: 'old', originalUrl: 'https://example.com' } as never);

    // Fast-forward past TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(SLUG_CACHE_TTL_MS + 1);

    expect(getCachedSlug('old')).toBeUndefined();
    expect(slugCache.size).toBe(0); // expired entry removed

    vi.useRealTimers();
  });

  it('evicts oldest entry when cache reaches max size', () => {
    for (let i = 0; i < SLUG_CACHE_MAX; i++) {
      setCachedSlug(`slug-${i}`, { id: i, slug: `slug-${i}`, originalUrl: `https://${i}.com` } as never);
    }
    expect(slugCache.size).toBe(SLUG_CACHE_MAX);

    // Adding one more should evict slug-0 (oldest)
    setCachedSlug('slug-new', { id: 9999, slug: 'slug-new', originalUrl: 'https://new.com' } as never);
    expect(slugCache.size).toBe(SLUG_CACHE_MAX);
    expect(getCachedSlug('slug-0')).toBeUndefined();
    expect(getCachedSlug('slug-new')).not.toBeUndefined();
  });

  it('getCachedSlug promotes entry to most-recent (LRU)', () => {
    setCachedSlug('a', { id: 1, slug: 'a', originalUrl: 'https://a.com' } as never);
    setCachedSlug('b', { id: 2, slug: 'b', originalUrl: 'https://b.com' } as never);

    // Access 'a' to promote it
    getCachedSlug('a');

    // The first key should now be 'b' (oldest)
    const firstKey = slugCache.keys().next().value;
    expect(firstKey).toBe('b');
  });
});

// ─── Middleware cache integration tests ─────────────────────────────────────

describe('middleware slug caching', () => {
  const validLink = {
    id: 42,
    slug: 'cached',
    originalUrl: 'https://example.com/cached',
    expiresAt: null,
    clicks: 10,
    userId: 'u1',
    folderId: null,
    isCustom: true,
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
    note: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    slugCache.clear();
    vi.mocked(isReservedPath).mockReturnValue(false);
    vi.mocked(extractClickMetadata).mockReturnValue(defaultMetadata);
    vi.mocked(recordClick).mockResolvedValue({} as never);
  });

  afterEach(() => {
    slugCache.clear();
  });

  it('caches D1 result and serves subsequent requests from cache', async () => {
    vi.mocked(getLinkBySlug).mockResolvedValue(validLink);

    // First request — cache miss, hits D1
    const res1 = await middleware(makeRequest('/cached'), makeEvent());
    expect(res1.status).toBe(307);
    expect(getLinkBySlug).toHaveBeenCalledTimes(1);

    // Second request — cache hit, no D1 call
    const res2 = await middleware(makeRequest('/cached'), makeEvent());
    expect(res2.status).toBe(307);
    expect(getLinkBySlug).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('caches null results (slug not found) to avoid repeated D1 lookups', async () => {
    vi.mocked(getLinkBySlug).mockResolvedValue(null);

    await middleware(makeRequest('/nope'), makeEvent());
    await middleware(makeRequest('/nope'), makeEvent());

    expect(getLinkBySlug).toHaveBeenCalledTimes(1);
  });

  it('re-fetches from D1 after cache entry expires', async () => {
    vi.mocked(getLinkBySlug).mockResolvedValue(validLink);

    await middleware(makeRequest('/cached'), makeEvent());
    expect(getLinkBySlug).toHaveBeenCalledTimes(1);

    // Expire the cache entry
    vi.useFakeTimers();
    vi.advanceTimersByTime(SLUG_CACHE_TTL_MS + 1);

    vi.mocked(getLinkBySlug).mockResolvedValue(validLink);
    await middleware(makeRequest('/cached'), makeEvent());
    expect(getLinkBySlug).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
