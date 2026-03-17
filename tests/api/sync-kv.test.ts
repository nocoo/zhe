/**
 * API E2E Tests for POST /api/cron/sync-kv
 *
 * Tests the KV sync endpoint from the perspective of the Cloudflare
 * Worker cron trigger. Validates secret-based auth, KV configuration
 * checks, sync lifecycle, and error handling.
 */
vi.unmock('@/lib/kv/client');
vi.unmock('@/lib/kv/sync');
vi.unmock('@/lib/kv/dirty');
vi.unmock('@/lib/db');
vi.unmock('@/lib/cron-history');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearCronHistory } from '@/lib/cron-history';
import { _resetDirtyFlag } from '@/lib/kv/dirty';

const mockGetAllLinksForKV = vi.fn();
const mockKvBulkPutLinks = vi.fn();
const mockIsKVConfigured = vi.fn();

vi.mock('@/lib/db', () => ({
  getAllLinksForKV: (...args: unknown[]) => mockGetAllLinksForKV(...args),
}));

vi.mock('@/lib/kv/client', () => ({
  kvBulkPutLinks: (...args: unknown[]) => mockKvBulkPutLinks(...args),
  isKVConfigured: () => mockIsKVConfigured(),
}));

const WORKER_SECRET = 'test-sync-secret';

function makeRequest(options: {
  secret?: string;
  method?: 'header' | 'query';
} = {}): Request {
  const url = options.method === 'query' && options.secret
    ? `http://localhost/api/cron/sync-kv?secret=${options.secret}`
    : 'http://localhost/api/cron/sync-kv';

  const headers: Record<string, string> = {};
  if (options.method !== 'query' && options.secret) {
    headers['authorization'] = `Bearer ${options.secret}`;
  }

  return new Request(url, { method: 'POST', headers });
}

describe('POST /api/cron/sync-kv', () => {
  beforeEach(() => {
    mockGetAllLinksForKV.mockReset();
    mockKvBulkPutLinks.mockReset();
    mockIsKVConfigured.mockReset();
    clearCronHistory();
    _resetDirtyFlag(true); // Ensure sync runs (not skipped) for each test
    process.env.WORKER_SECRET = WORKER_SECRET;
  });

  afterEach(() => {
    delete process.env.WORKER_SECRET;
  });

  // -- Auth scenarios --

  it('rejects request when WORKER_SECRET env is missing', async () => {
    delete process.env.WORKER_SECRET;

    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: 'anything' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('WORKER_SECRET not configured');
  });

  it('rejects request with no secret', async () => {
    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  it('rejects request with wrong secret', async () => {
    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: 'wrong' }));

    expect(res.status).toBe(401);
  });

  it('accepts secret via Bearer header', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });

    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(200);
  });

  it('accepts secret via query param', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });

    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET, method: 'query' }));

    expect(res.status).toBe(200);
  });

  // -- KV config check --

  it('returns 503 when KV is not configured', async () => {
    mockIsKVConfigured.mockReturnValue(false);

    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('KV not configured');
  });

  // -- Sync lifecycle --

  it('syncs links from D1 to KV and returns stats', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
      { id: 2, slug: 'def', originalUrl: 'https://b.com', expiresAt: 1700000000000 },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 2, failed: 0 });

    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.total).toBe(2);
    expect(body.durationMs).toBeTypeOf('number');
  });

  it('handles empty database gracefully', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });

    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(0);
    expect(body.total).toBe(0);
  });

  // -- Error handling --

  it('returns 500 when D1 fetch fails', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAllLinksForKV.mockRejectedValue(new Error('D1 down'));

    const { POST } = await import('@/app/api/cron/sync-kv/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
