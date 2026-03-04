/**
 * API Tests for POST /api/cron/cleanup-tmp
 *
 * Tests the tmp cleanup cron endpoint. Validates secret-based auth,
 * listing, expiration filtering, and batch deletion of expired files.
 */
vi.unmock('@/lib/r2/client');
vi.unmock('@/models/tmp-storage');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockListR2Objects = vi.fn();
const mockDeleteR2Objects = vi.fn();

vi.mock('@/lib/r2/client', () => ({
  listR2Objects: (...args: unknown[]) => mockListR2Objects(...args),
  deleteR2Objects: (...args: unknown[]) => mockDeleteR2Objects(...args),
}));

const WORKER_SECRET = 'test-cleanup-secret';
const UUID = '17ab9eca-f303-4e1e-8c4f-65a0a30e3041';

function makeRequest(options: {
  secret?: string;
  method?: 'header' | 'query';
} = {}): Request {
  const url = options.method === 'query' && options.secret
    ? `http://localhost/api/cron/cleanup-tmp?secret=${options.secret}`
    : 'http://localhost/api/cron/cleanup-tmp';

  const headers: Record<string, string> = {};
  if (options.method !== 'query' && options.secret) {
    headers['authorization'] = `Bearer ${options.secret}`;
  }

  return new Request(url, { method: 'POST', headers });
}

describe('POST /api/cron/cleanup-tmp', () => {
  beforeEach(() => {
    mockListR2Objects.mockReset();
    mockDeleteR2Objects.mockReset();
    process.env.WORKER_SECRET = WORKER_SECRET;
  });

  afterEach(() => {
    delete process.env.WORKER_SECRET;
  });

  // -- Auth scenarios --

  it('rejects request when WORKER_SECRET env is missing', async () => {
    delete process.env.WORKER_SECRET;

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: 'anything' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('WORKER_SECRET not configured');
  });

  it('rejects request with no secret', async () => {
    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  it('rejects request with wrong secret', async () => {
    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: 'wrong' }));

    expect(res.status).toBe(401);
  });

  it('accepts secret via Bearer header', async () => {
    mockListR2Objects.mockResolvedValue([]);

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(200);
  });

  it('accepts secret via query param', async () => {
    mockListR2Objects.mockResolvedValue([]);

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET, method: 'query' }));

    expect(res.status).toBe(200);
  });

  // -- Empty bucket --

  it('returns deleted:0 when tmp/ is empty', async () => {
    mockListR2Objects.mockResolvedValue([]);

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(0);
    expect(body.total).toBe(0);
  });

  // -- Cleanup lifecycle --

  it('deletes expired files and keeps fresh ones', async () => {
    const now = Date.now();
    const expiredTs = now - 3_600_001; // 1 hour + 1ms ago
    const freshTs = now - 1000; // 1 second ago

    mockListR2Objects.mockResolvedValue([
      { key: `tmp/${UUID}_${expiredTs}.zip`, size: 1000, lastModified: '' },
      { key: `tmp/${UUID}_${freshTs}.png`, size: 2000, lastModified: '' },
    ]);
    mockDeleteR2Objects.mockResolvedValue(1);

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(1);
    expect(body.expired).toBe(1);
    expect(body.total).toBe(2);

    // Verify deleteR2Objects was called with only the expired key
    expect(mockDeleteR2Objects).toHaveBeenCalledOnce();
    expect(mockDeleteR2Objects.mock.calls[0][0]).toEqual([
      `tmp/${UUID}_${expiredTs}.zip`,
    ]);
  });

  it('returns deleted:0 when all files are fresh', async () => {
    const now = Date.now();
    const freshTs = now - 1000;

    mockListR2Objects.mockResolvedValue([
      { key: `tmp/${UUID}_${freshTs}.zip`, size: 1000, lastModified: '' },
    ]);

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(0);
    expect(body.total).toBe(1);
    expect(mockDeleteR2Objects).not.toHaveBeenCalled();
  });

  it('passes TMP_PREFIX to listR2Objects', async () => {
    mockListR2Objects.mockResolvedValue([]);

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(mockListR2Objects).toHaveBeenCalledWith('tmp/');
  });

  // -- Error handling --

  it('returns 500 when listR2Objects fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockListR2Objects.mockRejectedValue(new Error('R2 down'));

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to list tmp objects');
  });

  it('returns 500 when deleteR2Objects fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const now = Date.now();
    const expiredTs = now - 3_600_001;

    mockListR2Objects.mockResolvedValue([
      { key: `tmp/${UUID}_${expiredTs}.zip`, size: 1000, lastModified: '' },
    ]);
    mockDeleteR2Objects.mockRejectedValue(new Error('R2 delete failed'));

    const { POST } = await import('@/app/api/cron/cleanup-tmp/route');
    const res = await POST(makeRequest({ secret: WORKER_SECRET }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to delete expired files');
  });
});
