// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

const mockGetCronHistory = vi.fn();
vi.mock('@/lib/cron-history', () => ({
  getCronHistory: () => mockGetCronHistory(),
}));

const mockPerformKVSync = vi.fn();
vi.mock('@/lib/kv/sync', () => ({
  performKVSync: () => mockPerformKVSync(),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

import { getWorkerHealth } from '@/actions/worker-status';
import type { CronHistoryEntry } from '@/lib/cron-history';
import { unwrap } from '../test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<CronHistoryEntry> = {}): CronHistoryEntry {
  return {
    timestamp: '2026-03-01T12:00:00.000Z',
    status: 'success',
    synced: 42,
    failed: 0,
    total: 42,
    durationMs: 150,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getWorkerHealth action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await getWorkerHealth();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error when user id is missing', async () => {
    mockGetSession.mockResolvedValue({ user: {} });

    const result = await getWorkerHealth();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns derived health from cron history', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const entries = [
      makeEntry({ timestamp: '2026-03-01T12:15:00.000Z', status: 'success', synced: 50, total: 50 }),
      makeEntry({ timestamp: '2026-03-01T12:00:00.000Z', status: 'error', synced: 0, failed: 1, total: 0, error: 'D1 timeout' }),
    ];
    mockGetCronHistory.mockReturnValue(entries);

    const result = await getWorkerHealth();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(unwrap(result.data).lastSyncTime).toBe('2026-03-01T12:15:00.000Z');
    expect(unwrap(result.data).kvKeyCount).toBe(50);
    expect(mockPerformKVSync).not.toHaveBeenCalled();
  });

  it('triggers KV sync when history is empty (first visit after deploy)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const seededEntry = makeEntry({ synced: 66, total: 66 });
    // First call returns empty, second call (after sync) returns seeded data
    mockGetCronHistory
      .mockReturnValueOnce([])
      .mockReturnValueOnce([seededEntry]);
    mockPerformKVSync.mockResolvedValue({ synced: 66, failed: 0, total: 66, durationMs: 200 });

    const result = await getWorkerHealth();
    expect(result.success).toBe(true);
    expect(mockPerformKVSync).toHaveBeenCalledOnce();
    expect(unwrap(result.data).kvKeyCount).toBe(66);
  });

  it('returns health with empty history when sync also produces nothing', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    // Both calls return empty (KV not configured)
    mockGetCronHistory.mockReturnValue([]);
    mockPerformKVSync.mockResolvedValue({ synced: 0, failed: 0, total: 0, durationMs: 0, error: 'KV not configured' });

    const result = await getWorkerHealth();
    expect(result.success).toBe(true);
    expect(unwrap(result.data).lastSyncTime).toBeNull();
    expect(unwrap(result.data).kvKeyCount).toBeNull();
  });

  it('returns error when an unexpected exception occurs', async () => {
    mockGetSession.mockRejectedValue(new Error('Session exploded'));

    const result = await getWorkerHealth();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to get KV cache status');
  });
});