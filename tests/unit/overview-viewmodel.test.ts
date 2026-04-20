// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/actions/overview', () => ({
  getOverviewStats: vi.fn(),
}));

vi.mock('@/actions/worker-status', () => ({
  getWorkerHealth: vi.fn(),
}));

import {
  useOverviewViewModel,
  _resetCache,
  _cache,
  STALE_THRESHOLD_MS,
} from '@/viewmodels/useOverviewViewModel';
import { getOverviewStats } from '@/actions/overview';
import { getWorkerHealth } from '@/actions/worker-status';
import type { OverviewStats, WorkerHealthStatus } from '@/models/overview';
import { unwrap } from '../test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<OverviewStats> = {}): OverviewStats {
  return {
    totalLinks: 10,
    totalClicks: 500,
    totalUploads: 5,
    totalStorageBytes: 1048576,
    clickTrend: [
      { date: '2026-02-10', clicks: 1, origin: 0, worker: 1 },
      { date: '2026-02-11', clicks: 1, origin: 1, worker: 0 },
    ],
    uploadTrend: [{ date: '2026-02-10', uploads: 1 }, { date: '2026-02-12', uploads: 1 }],
    topLinks: [{ slug: 'abc', originalUrl: 'https://example.com', clicks: 100 }],
    deviceBreakdown: { desktop: 300, mobile: 200 },
    browserBreakdown: { Chrome: 400 },
    osBreakdown: { macOS: 300 },
    fileTypeBreakdown: { 'image/png': 3, 'image/jpeg': 2 },
    ...overrides,
  };
}

function makeWorkerHealth(overrides: Partial<WorkerHealthStatus> = {}): WorkerHealthStatus {
  return {
    lastSyncTime: '2026-03-01T12:00:00.000Z',
    kvKeyCount: 42,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOverviewViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCache();
    // Default: worker health resolves successfully
    vi.mocked(getWorkerHealth).mockResolvedValue({
      success: true,
      data: makeWorkerHealth(),
    });
  });

  // ==================================================================
  // Cold start (no cache, no initialData)
  // ==================================================================

  it('starts in loading state', () => {
    vi.mocked(getOverviewStats).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useOverviewViewModel());

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.stats).toBeNull();
    expect(result.current.revalidating).toBe(false);
  });

  it('loads stats on mount', async () => {
    const mockStats = makeStats();
    vi.mocked(getOverviewStats).mockResolvedValue({ success: true, data: mockStats });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats).toEqual(mockStats);
    expect(result.current.error).toBeNull();
  });

  it('sets error when action fails', async () => {
    vi.mocked(getOverviewStats).mockResolvedValue({ success: false, error: 'Unauthorized' });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Unauthorized');
    expect(result.current.stats).toBeNull();
  });

  it('sets error when action throws', async () => {
    vi.mocked(getOverviewStats).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('加载概览数据失败');
    expect(result.current.stats).toBeNull();
  });

  // ==================================================================
  // SSR prefetch (initialData)
  // ==================================================================

  it('skips fetch and uses initialData when provided', () => {
    const prefetched = makeStats({ totalLinks: 42, totalClicks: 999 });

    const { result } = renderHook(() => useOverviewViewModel(prefetched));

    // Loading should be false immediately
    expect(result.current.loading).toBe(false);
    expect(result.current.stats).toEqual(prefetched);
    expect(result.current.error).toBeNull();
    expect(result.current.revalidating).toBe(false);
    // Server action should NOT be called
    expect(getOverviewStats).not.toHaveBeenCalled();
  });

  it('updates module cache when initialData is provided', () => {
    const prefetched = makeStats({ totalLinks: 77 });

    renderHook(() => useOverviewViewModel(prefetched));

    expect(_cache.stats).toEqual(prefetched);
    expect(_cache.fetchedAt).toBeGreaterThan(0);
  });

  it('passes pre-aggregated trend data through to stats', async () => {
    const mockStats = makeStats({
      clickTrend: [
        { date: '2026-02-10', clicks: 2, origin: 1, worker: 1 },
        { date: '2026-02-11', clicks: 1, origin: 0, worker: 1 },
      ],
      uploadTrend: [
        { date: '2026-02-10', uploads: 1 },
        { date: '2026-02-12', uploads: 1 },
      ],
      fileTypeBreakdown: { 'image/png': 1, 'image/jpeg': 1 },
    });
    vi.mocked(getOverviewStats).mockResolvedValue({ success: true, data: mockStats });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(unwrap(result.current.stats).clickTrend).toEqual([
      { date: '2026-02-10', clicks: 2, origin: 1, worker: 1 },
      { date: '2026-02-11', clicks: 1, origin: 0, worker: 1 },
    ]);
    expect(unwrap(result.current.stats).uploadTrend).toEqual([
      { date: '2026-02-10', uploads: 1 },
      { date: '2026-02-12', uploads: 1 },
    ]);
    expect(unwrap(result.current.stats).fileTypeBreakdown).toEqual({ 'image/png': 1, 'image/jpeg': 1 });
  });

  // ==================================================================
  // Stale-while-revalidate
  // ==================================================================

  it('uses fresh cache without refetch when data is less than 5 minutes old', () => {
    // Seed cache as if data was fetched 2 minutes ago
    const cachedStats = makeStats({ totalLinks: 50 });
    _cache.stats = cachedStats;
    _cache.fetchedAt = Date.now() - 2 * 60 * 1000;

    const { result } = renderHook(() => useOverviewViewModel());

    expect(result.current.loading).toBe(false);
    expect(result.current.stats).toEqual(cachedStats);
    expect(result.current.revalidating).toBe(false);
    expect(getOverviewStats).not.toHaveBeenCalled();
  });

  it('shows stale cache immediately and revalidates in background when data is over 5 minutes old', async () => {
    const staleStats = makeStats({ totalLinks: 50 });
    const freshStats = makeStats({ totalLinks: 75 });

    // Seed cache as stale (6 minutes ago)
    _cache.stats = staleStats;
    _cache.fetchedAt = Date.now() - (STALE_THRESHOLD_MS + 60_000);

    vi.mocked(getOverviewStats).mockResolvedValue({ success: true, data: freshStats });

    const { result } = renderHook(() => useOverviewViewModel());

    // Immediately shows stale data (not loading)
    expect(result.current.loading).toBe(false);
    expect(result.current.stats).toEqual(staleStats);
    expect(result.current.revalidating).toBe(true);

    // After revalidation completes, data is updated
    await waitFor(() => {
      expect(result.current.revalidating).toBe(false);
    });

    expect(result.current.stats).toEqual(freshStats);
    expect(result.current.error).toBeNull();
    expect(getOverviewStats).toHaveBeenCalledOnce();
  });

  it('keeps stale data when background revalidation fails', async () => {
    const staleStats = makeStats({ totalLinks: 50 });

    _cache.stats = staleStats;
    _cache.fetchedAt = Date.now() - (STALE_THRESHOLD_MS + 60_000);

    vi.mocked(getOverviewStats).mockResolvedValue({ success: false, error: 'Server error' });

    const { result } = renderHook(() => useOverviewViewModel());

    // Shows stale data immediately
    expect(result.current.loading).toBe(false);
    expect(result.current.stats).toEqual(staleStats);

    await waitFor(() => {
      expect(result.current.revalidating).toBe(false);
    });

    // Stale data is preserved, no error shown
    expect(result.current.stats).toEqual(staleStats);
    expect(result.current.error).toBeNull();
  });

  it('keeps stale data when background revalidation throws', async () => {
    const staleStats = makeStats({ totalLinks: 50 });

    _cache.stats = staleStats;
    _cache.fetchedAt = Date.now() - (STALE_THRESHOLD_MS + 60_000);

    vi.mocked(getOverviewStats).mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useOverviewViewModel());

    expect(result.current.stats).toEqual(staleStats);

    await waitFor(() => {
      expect(result.current.revalidating).toBe(false);
    });

    expect(result.current.stats).toEqual(staleStats);
    expect(result.current.error).toBeNull();
  });

  it('updates cache timestamp after successful revalidation', async () => {
    const staleStats = makeStats({ totalLinks: 50 });
    const freshStats = makeStats({ totalLinks: 75 });

    _cache.stats = staleStats;
    _cache.fetchedAt = Date.now() - (STALE_THRESHOLD_MS + 60_000);
    const oldFetchedAt = _cache.fetchedAt;

    vi.mocked(getOverviewStats).mockResolvedValue({ success: true, data: freshStats });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.revalidating).toBe(false);
    });

    expect(_cache.stats).toEqual(freshStats);
    expect(_cache.fetchedAt).toBeGreaterThan(oldFetchedAt);
  });

  it('updates cache after cold-start fetch', async () => {
    const mockStats = makeStats({ totalLinks: 33 });
    vi.mocked(getOverviewStats).mockResolvedValue({ success: true, data: mockStats });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(_cache.stats).toEqual(mockStats);
    expect(_cache.fetchedAt).toBeGreaterThan(0);
  });

  // ==================================================================
  // Worker health
  // ==================================================================

  it('fetches worker health independently and populates state', async () => {
    vi.mocked(getOverviewStats).mockReturnValue(new Promise(() => {})); // stats never resolve
    const health = makeWorkerHealth({ kvKeyCount: 99 });
    vi.mocked(getWorkerHealth).mockResolvedValue({ success: true, data: health });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.workerHealthLoading).toBe(false);
    });

    expect(result.current.workerHealth).toEqual(health);
    // Main stats should still be loading (they never resolved)
    expect(result.current.loading).toBe(true);
  });

  it('starts with workerHealthLoading true', () => {
    vi.mocked(getOverviewStats).mockReturnValue(new Promise(() => {}));
    vi.mocked(getWorkerHealth).mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useOverviewViewModel());

    expect(result.current.workerHealthLoading).toBe(true);
    expect(result.current.workerHealth).toBeNull();
  });

  it('silently handles worker health failure', async () => {
    vi.mocked(getOverviewStats).mockReturnValue(new Promise(() => {}));
    vi.mocked(getWorkerHealth).mockResolvedValue({ success: false, error: 'Unauthorized' });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.workerHealthLoading).toBe(false);
    });

    // Health remains null on failure — no error propagated
    expect(result.current.workerHealth).toBeNull();
  });

  it('silently handles worker health exception', async () => {
    vi.mocked(getOverviewStats).mockReturnValue(new Promise(() => {}));
    vi.mocked(getWorkerHealth).mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.workerHealthLoading).toBe(false);
    });

    expect(result.current.workerHealth).toBeNull();
  });
});