vi.unmock('@/lib/kv/client');
vi.unmock('@/lib/kv/sync');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPerformKVSync = vi.fn();
const mockIsKVConfigured = vi.fn();

vi.mock('@/lib/kv/sync', () => ({
  performKVSync: (...args: unknown[]) => mockPerformKVSync(...args),
}));

vi.mock('@/lib/kv/client', () => ({
  isKVConfigured: () => mockIsKVConfigured(),
}));

import { POST } from '@/app/api/cron/sync-kv/route';

function makeRequest(secret?: string, useQuery = false): Request {
  const url = useQuery && secret
    ? `http://localhost:7005/api/cron/sync-kv?secret=${secret}`
    : 'http://localhost:7005/api/cron/sync-kv';

  const headers: Record<string, string> = {};
  if (!useQuery && secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  }

  return new Request(url, { method: 'POST', headers });
}

describe('POST /api/cron/sync-kv', () => {
  beforeEach(() => {
    mockPerformKVSync.mockReset();
    mockIsKVConfigured.mockReset();
    process.env.WORKER_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.WORKER_SECRET;
  });

  it('returns 500 when WORKER_SECRET not set', async () => {
    delete process.env.WORKER_SECRET;

    const res = await POST(makeRequest('anything'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain('WORKER_SECRET');
  });

  it('returns 401 on wrong secret', async () => {
    const res = await POST(makeRequest('wrong-secret'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 503 when KV not configured', async () => {
    mockIsKVConfigured.mockReturnValue(false);

    const res = await POST(makeRequest('test-secret'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain('KV not configured');
  });

  it('returns skipped when sync result has skipped: true', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    mockPerformKVSync.mockResolvedValue({
      synced: 0,
      failed: 0,
      total: 0,
      durationMs: 0,
      skipped: true,
    });

    const res = await POST(makeRequest('test-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(body.message).toBe('No mutations since last sync');
  });

  it('returns sync stats on success', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    mockPerformKVSync.mockResolvedValue({
      synced: 10,
      failed: 0,
      total: 10,
      durationMs: 150,
    });

    const res = await POST(makeRequest('test-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.synced).toBe(10);
    expect(body.failed).toBe(0);
    expect(body.total).toBe(10);
    expect(body.durationMs).toBe(150);
  });

  it('returns 500 on sync error', async () => {
    mockIsKVConfigured.mockReturnValue(true);
    mockPerformKVSync.mockResolvedValue({
      synced: 0,
      failed: 0,
      total: 0,
      durationMs: 50,
      error: 'Failed to fetch links from D1',
    });

    const res = await POST(makeRequest('test-secret'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to fetch links from D1');
  });
});
