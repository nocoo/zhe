/**
 * API E2E Tests for GET /api/worker-status
 *
 * Tests the worker status endpoint from the perspective of an
 * authenticated dashboard user. Validates auth guard, response
 * structure, and cron history integration.
 */
vi.unmock('@/lib/cron-history');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordCronResult, clearCronHistory } from '@/lib/cron-history';

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

describe('GET /api/worker-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCronHistory();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import('@/app/api/worker-status/route');
    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns null health when no sync has occurred', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const { GET } = await import('@/app/api/worker-status/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastSyncTime).toBeNull();
    expect(body.kvKeyCount).toBeNull();
  });

  it('returns health derived from cron history after successful sync', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

    recordCronResult({
      timestamp: '2026-03-01T12:00:00Z',
      status: 'success',
      synced: 100,
      failed: 0,
      total: 100,
      durationMs: 200,
    });

    const { GET } = await import('@/app/api/worker-status/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastSyncTime).toBe('2026-03-01T12:00:00Z');
    expect(body.kvKeyCount).toBe(100);
  });

  it('ignores error entries when deriving last successful sync', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

    recordCronResult({
      timestamp: '2026-03-01T12:00:00Z',
      status: 'success',
      synced: 50,
      failed: 0,
      total: 50,
      durationMs: 100,
    });
    recordCronResult({
      timestamp: '2026-03-01T13:00:00Z',
      status: 'error',
      synced: 0,
      failed: 0,
      total: 0,
      durationMs: 10,
      error: 'D1 timeout',
    });

    const { GET } = await import('@/app/api/worker-status/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    // Should still return the last successful sync
    expect(body.lastSyncTime).toBe('2026-03-01T12:00:00Z');
    expect(body.kvKeyCount).toBe(50);
  });
});
