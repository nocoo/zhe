import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/actions/overview', () => ({
  getOverviewStats: vi.fn(),
}));

import { useOverviewViewModel } from '@/viewmodels/useOverviewViewModel';
import { getOverviewStats } from '@/actions/overview';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOverviewViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in loading state', () => {
    vi.mocked(getOverviewStats).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useOverviewViewModel());

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.stats).toBeNull();
  });

  it('loads stats on mount', async () => {
    const mockStats = {
      totalLinks: 10,
      totalClicks: 500,
      totalUploads: 5,
      totalStorageBytes: 1048576,
      clickTimestamps: [new Date('2026-02-10'), new Date('2026-02-11')],
      uploadTimestamps: [new Date('2026-02-10'), new Date('2026-02-12')],
      topLinks: [{ slug: 'abc', originalUrl: 'https://example.com', clicks: 100 }],
      deviceBreakdown: { desktop: 300, mobile: 200 },
      browserBreakdown: { Chrome: 400 },
      osBreakdown: { macOS: 300 },
      fileTypeBreakdown: { 'image/png': 3, 'image/jpeg': 2 },
    };
    vi.mocked(getOverviewStats).mockResolvedValue({ success: true, data: mockStats });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats).not.toBeNull();
    expect(result.current.stats!.totalLinks).toBe(10);
    expect(result.current.stats!.totalClicks).toBe(500);
    expect(result.current.stats!.clickTrend).toHaveLength(2);
    expect(result.current.stats!.uploadTrend).toHaveLength(2);
    expect(result.current.stats!.topLinks).toHaveLength(1);
    expect(result.current.stats!.fileTypeBreakdown).toEqual({ 'image/png': 3, 'image/jpeg': 2 });
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

  it('transforms click timestamps into click trend and upload timestamps into upload trend', async () => {
    const mockStats = {
      totalLinks: 1,
      totalClicks: 3,
      totalUploads: 2,
      totalStorageBytes: 2048,
      clickTimestamps: [
        new Date('2026-02-10T08:00:00Z'),
        new Date('2026-02-10T14:30:00Z'),
        new Date('2026-02-11T09:00:00Z'),
      ],
      uploadTimestamps: [
        new Date('2026-02-10T10:00:00Z'),
        new Date('2026-02-12T15:00:00Z'),
      ],
      topLinks: [],
      deviceBreakdown: {},
      browserBreakdown: {},
      osBreakdown: {},
      fileTypeBreakdown: { 'image/png': 1, 'image/jpeg': 1 },
    };
    vi.mocked(getOverviewStats).mockResolvedValue({ success: true, data: mockStats });

    const { result } = renderHook(() => useOverviewViewModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats!.clickTrend).toEqual([
      { date: '2026-02-10', clicks: 2 },
      { date: '2026-02-11', clicks: 1 },
    ]);
    expect(result.current.stats!.uploadTrend).toEqual([
      { date: '2026-02-10', uploads: 1 },
      { date: '2026-02-12', uploads: 1 },
    ]);
    expect(result.current.stats!.fileTypeBreakdown).toEqual({ 'image/png': 1, 'image/jpeg': 1 });
  });
});
