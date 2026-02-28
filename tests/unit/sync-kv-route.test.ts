vi.unmock('@/lib/kv/client');
vi.unmock('@/lib/db');
vi.unmock('@/lib/cron-history');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/cron/sync-kv/route';
import { getCronHistory, clearCronHistory } from '@/lib/cron-history';

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

const WORKER_SECRET = 'test-worker-secret-123';

describe('POST /api/cron/sync-kv', () => {
  beforeEach(() => {
    mockGetAllLinksForKV.mockReset();
    mockKvBulkPutLinks.mockReset();
    mockIsKVConfigured.mockReset();
    clearCronHistory();
    process.env.WORKER_SECRET = WORKER_SECRET;
  });

  afterEach(() => {
    delete process.env.WORKER_SECRET;
  });

  it('returns 500 when WORKER_SECRET is not configured', async () => {
    delete process.env.WORKER_SECRET;

    const res = await POST(makeRequest({ secret: 'anything' }));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toContain('WORKER_SECRET not configured');
  });

  it('returns 401 when no secret is provided', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 when wrong secret is provided via header', async () => {
    const res = await POST(makeRequest({ secret: 'wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when wrong secret is provided via query', async () => {
    const res = await POST(makeRequest({ secret: 'wrong-secret', method: 'query' }));
    expect(res.status).toBe(401);
  });

  it('accepts secret via Bearer header', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });

    const res = await POST(makeRequest({ secret: WORKER_SECRET }));
    expect(res.status).toBe(200);
  });

  it('accepts secret via query param', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });

    const res = await POST(makeRequest({ secret: WORKER_SECRET, method: 'query' }));
    expect(res.status).toBe(200);
  });

  it('returns 503 when KV is not configured', async () => {
    mockIsKVConfigured.mockReturnValue(false);

    const res = await POST(makeRequest({ secret: WORKER_SECRET }));
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toContain('KV not configured');
  });

  it('returns 500 when D1 fetch fails', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAllLinksForKV.mockRejectedValue(new Error('D1 down'));

    const res = await POST(makeRequest({ secret: WORKER_SECRET }));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toContain('Failed to fetch links');
    consoleSpy.mockRestore();
  });

  it('syncs all links and returns stats', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
      { id: 2, slug: 'def', originalUrl: 'https://b.com', expiresAt: 1700000000000 },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 2, failed: 0 });

    const res = await POST(makeRequest({ secret: WORKER_SECRET }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.synced).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.total).toBe(2);
    expect(body.durationMs).toBeTypeOf('number');

    // Verify bulk put was called with correct entries
    expect(mockKvBulkPutLinks).toHaveBeenCalledWith([
      { slug: 'abc', data: { id: 1, originalUrl: 'https://a.com', expiresAt: null } },
      { slug: 'def', data: { id: 2, originalUrl: 'https://b.com', expiresAt: 1700000000000 } },
    ]);
    consoleSpy.mockRestore();
  });

  it('reports partial failures', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 1 });

    const res = await POST(makeRequest({ secret: WORKER_SECRET }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.synced).toBe(0);
    expect(body.failed).toBe(1);
    consoleSpy.mockRestore();
  });

  it('handles empty database gracefully', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 0 });

    const res = await POST(makeRequest({ secret: WORKER_SECRET }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.synced).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.total).toBe(0);
    consoleSpy.mockRestore();
  });

  // ---- Cron history recording ----

  it('records successful sync in cron history', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 1, failed: 0 });

    await POST(makeRequest({ secret: WORKER_SECRET }));

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('success');
    expect(history[0].synced).toBe(1);
    expect(history[0].failed).toBe(0);
    expect(history[0].total).toBe(1);
    expect(history[0].durationMs).toBeTypeOf('number');
    expect(history[0].timestamp).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('records D1 fetch error in cron history', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAllLinksForKV.mockRejectedValue(new Error('D1 down'));

    await POST(makeRequest({ secret: WORKER_SECRET }));

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('error');
    expect(history[0].synced).toBe(0);
    expect(history[0].error).toBe('Failed to fetch links from D1');
    consoleSpy.mockRestore();
  });

  it('records partial failure as error in cron history', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGetAllLinksForKV.mockResolvedValue([
      { id: 1, slug: 'abc', originalUrl: 'https://a.com', expiresAt: null },
    ]);
    mockKvBulkPutLinks.mockResolvedValue({ success: 0, failed: 1 });

    await POST(makeRequest({ secret: WORKER_SECRET }));

    const history = getCronHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('error');
    expect(history[0].failed).toBe(1);
    consoleSpy.mockRestore();
  });

  it('does not record history for auth/config failures', async () => {
    // Auth failure
    delete process.env.WORKER_SECRET;
    await POST(makeRequest({ secret: 'anything' }));
    expect(getCronHistory()).toHaveLength(0);

    // KV not configured
    process.env.WORKER_SECRET = WORKER_SECRET;
    mockIsKVConfigured.mockReturnValue(false);
    await POST(makeRequest({ secret: WORKER_SECRET }));
    expect(getCronHistory()).toHaveLength(0);
  });
});
