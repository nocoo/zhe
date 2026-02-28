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

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

import { getWorkerHealth } from '@/actions/worker-status';
import type { CronHistoryEntry } from '@/lib/cron-history';

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
    expect(result.data!.cronHistory).toEqual(entries);
    expect(result.data!.lastSyncTime).toBe('2026-03-01T12:15:00.000Z');
    expect(result.data!.kvKeyCount).toBe(50);
    expect(result.data!.syncSuccessRate).toBe(50); // 1 out of 2
  });

  it('returns health with empty history', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetCronHistory.mockReturnValue([]);

    const result = await getWorkerHealth();
    expect(result.success).toBe(true);
    expect(result.data!.cronHistory).toEqual([]);
    expect(result.data!.lastSyncTime).toBeNull();
    expect(result.data!.kvKeyCount).toBeNull();
    expect(result.data!.syncSuccessRate).toBeNull();
  });

  it('returns error when an unexpected exception occurs', async () => {
    mockGetSession.mockRejectedValue(new Error('Session exploded'));

    const result = await getWorkerHealth();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to get worker health');
  });
});
