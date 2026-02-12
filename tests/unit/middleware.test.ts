import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
