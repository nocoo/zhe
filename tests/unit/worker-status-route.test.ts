vi.unmock('@/lib/cron-history');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/worker-status/route';
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

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns empty health status when no cron history', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.cronHistory).toEqual([]);
    expect(body.lastSyncTime).toBeNull();
    expect(body.kvKeyCount).toBeNull();
    expect(body.syncSuccessRate).toBeNull();
  });

  it('returns derived health status from cron history', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

    recordCronResult({
      timestamp: '2026-03-01T10:00:00Z',
      status: 'success',
      synced: 42,
      failed: 0,
      total: 42,
      durationMs: 150,
    });
    recordCronResult({
      timestamp: '2026-03-01T10:15:00Z',
      status: 'error',
      synced: 0,
      failed: 0,
      total: 0,
      durationMs: 50,
      error: 'D1 timeout',
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.cronHistory).toHaveLength(2);
    expect(body.lastSyncTime).toBe('2026-03-01T10:00:00Z');
    expect(body.kvKeyCount).toBe(42);
    expect(body.syncSuccessRate).toBe(50); // 1 out of 2
  });
});
