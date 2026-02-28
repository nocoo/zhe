import { describe, it, expect } from 'vitest';
import {
  formatClickCount,
  formatStorageSize,
  buildClickTrend,
  buildUploadTrend,
  buildFileTypeBreakdown,
  deriveWorkerHealth,
  formatRelativeTime,
  type OverviewStats,
  type ClickTrendPoint,
  type TopLinkEntry,
  type UploadTrendPoint,
  type WorkerHealthStatus,
} from '@/models/overview';
import type { CronHistoryEntry } from '@/lib/cron-history';

describe('overview model', () => {
  // ---- formatClickCount ----
  describe('formatClickCount', () => {
    it('returns "0" for zero', () => {
      expect(formatClickCount(0)).toBe('0');
    });

    it('returns plain number under 1000', () => {
      expect(formatClickCount(999)).toBe('999');
    });

    it('abbreviates thousands with K', () => {
      expect(formatClickCount(1000)).toBe('1.0K');
      expect(formatClickCount(1500)).toBe('1.5K');
      expect(formatClickCount(9999)).toBe('10.0K');
    });

    it('abbreviates millions with M', () => {
      expect(formatClickCount(1_000_000)).toBe('1.0M');
      expect(formatClickCount(2_500_000)).toBe('2.5M');
    });
  });

  // ---- formatStorageSize ----
  describe('formatStorageSize', () => {
    it('returns "0 B" for zero', () => {
      expect(formatStorageSize(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatStorageSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(formatStorageSize(1024)).toBe('1.0 KB');
      expect(formatStorageSize(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatStorageSize(1048576)).toBe('1.0 MB');
    });

    it('formats gigabytes', () => {
      expect(formatStorageSize(1073741824)).toBe('1.0 GB');
    });
  });

  // ---- buildClickTrend ----
  describe('buildClickTrend', () => {
    it('returns empty array when no data', () => {
      expect(buildClickTrend([])).toEqual([]);
    });

    it('aggregates clicks by date', () => {
      const timestamps = [
        new Date('2026-02-10T08:00:00Z'),
        new Date('2026-02-10T14:30:00Z'),
        new Date('2026-02-11T09:00:00Z'),
      ];
      const result = buildClickTrend(timestamps);

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-02-10');
      expect(result[0].clicks).toBe(2);
      expect(result[1].date).toBe('2026-02-11');
      expect(result[1].clicks).toBe(1);
    });

    it('sorts by date ascending', () => {
      const timestamps = [
        new Date('2026-02-12T00:00:00Z'),
        new Date('2026-02-10T00:00:00Z'),
        new Date('2026-02-11T00:00:00Z'),
      ];
      const result = buildClickTrend(timestamps);

      expect(result.map(p => p.date)).toEqual([
        '2026-02-10',
        '2026-02-11',
        '2026-02-12',
      ]);
    });
  });

  // ---- buildUploadTrend ----
  describe('buildUploadTrend', () => {
    it('returns empty array when no data', () => {
      expect(buildUploadTrend([])).toEqual([]);
    });

    it('aggregates uploads by date', () => {
      const timestamps = [
        new Date('2026-02-10T08:00:00Z'),
        new Date('2026-02-10T14:30:00Z'),
        new Date('2026-02-11T09:00:00Z'),
      ];
      const result = buildUploadTrend(timestamps);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: '2026-02-10', uploads: 2 });
      expect(result[1]).toEqual({ date: '2026-02-11', uploads: 1 });
    });

    it('sorts by date ascending', () => {
      const timestamps = [
        new Date('2026-02-12T00:00:00Z'),
        new Date('2026-02-10T00:00:00Z'),
        new Date('2026-02-11T00:00:00Z'),
      ];
      const result = buildUploadTrend(timestamps);

      expect(result.map(p => p.date)).toEqual([
        '2026-02-10',
        '2026-02-11',
        '2026-02-12',
      ]);
    });
  });

  // ---- buildFileTypeBreakdown ----
  describe('buildFileTypeBreakdown', () => {
    it('returns empty object when no data', () => {
      expect(buildFileTypeBreakdown([])).toEqual({});
    });

    it('counts occurrences of each file type', () => {
      const types = ['image/png', 'image/jpeg', 'image/png', 'image/webp'];
      const result = buildFileTypeBreakdown(types);

      expect(result).toEqual({
        'image/png': 2,
        'image/jpeg': 1,
        'image/webp': 1,
      });
    });

    it('handles single file type', () => {
      const result = buildFileTypeBreakdown(['application/pdf']);
      expect(result).toEqual({ 'application/pdf': 1 });
    });
  });

  // ---- Type assertions (compile-time) ----
  it('OverviewStats type includes upload trend and file type breakdown', () => {
    const stats: OverviewStats = {
      totalLinks: 10,
      totalClicks: 500,
      totalUploads: 20,
      totalStorageBytes: 1048576,
      clickTrend: [{ date: '2026-02-10', clicks: 5 }],
      uploadTrend: [{ date: '2026-02-10', uploads: 3 }],
      topLinks: [{ slug: 'abc', originalUrl: 'https://example.com', clicks: 100 }],
      deviceBreakdown: { desktop: 300, mobile: 200 },
      browserBreakdown: { Chrome: 400, Safari: 100 },
      osBreakdown: { macOS: 300, Windows: 200 },
      fileTypeBreakdown: { 'image/png': 10, 'image/jpeg': 5 },
    };
    expect(stats.totalLinks).toBe(10);
    expect(stats.uploadTrend).toHaveLength(1);
    expect(stats.fileTypeBreakdown['image/png']).toBe(10);
  });

  it('ClickTrendPoint type is well-defined', () => {
    const point: ClickTrendPoint = { date: '2026-02-10', clicks: 5 };
    expect(point.date).toBe('2026-02-10');
  });

  it('UploadTrendPoint type is well-defined', () => {
    const point: UploadTrendPoint = { date: '2026-02-10', uploads: 3 };
    expect(point.date).toBe('2026-02-10');
    expect(point.uploads).toBe(3);
  });

  it('TopLinkEntry type is well-defined', () => {
    const entry: TopLinkEntry = {
      slug: 'abc',
      originalUrl: 'https://example.com',
      clicks: 100,
    };
    expect(entry.slug).toBe('abc');
  });

  // ---- deriveWorkerHealth ----
  describe('deriveWorkerHealth', () => {
    function makeEntry(overrides: Partial<CronHistoryEntry> = {}): CronHistoryEntry {
      return {
        timestamp: '2026-03-01T10:00:00Z',
        status: 'success',
        synced: 10,
        failed: 0,
        total: 10,
        durationMs: 100,
        ...overrides,
      };
    }

    it('returns null fields when history is empty', () => {
      const health = deriveWorkerHealth([]);
      expect(health.cronHistory).toEqual([]);
      expect(health.lastSyncTime).toBeNull();
      expect(health.kvKeyCount).toBeNull();
      expect(health.syncSuccessRate).toBeNull();
    });

    it('derives health from successful entries', () => {
      const entries = [
        makeEntry({ timestamp: '2026-03-01T10:15:00Z', total: 42 }),
        makeEntry({ timestamp: '2026-03-01T10:00:00Z', total: 40 }),
      ];
      const health = deriveWorkerHealth(entries);

      expect(health.lastSyncTime).toBe('2026-03-01T10:15:00Z');
      expect(health.kvKeyCount).toBe(42);
      expect(health.syncSuccessRate).toBe(100);
    });

    it('finds first successful entry when latest is error', () => {
      const entries: CronHistoryEntry[] = [
        makeEntry({ timestamp: '2026-03-01T10:30:00Z', status: 'error', total: 0 }),
        makeEntry({ timestamp: '2026-03-01T10:15:00Z', status: 'success', total: 42 }),
      ];
      const health = deriveWorkerHealth(entries);

      expect(health.lastSyncTime).toBe('2026-03-01T10:15:00Z');
      expect(health.kvKeyCount).toBe(42);
      expect(health.syncSuccessRate).toBe(50);
    });

    it('returns null lastSyncTime when all entries are errors', () => {
      const entries = [
        makeEntry({ status: 'error', total: 0 }),
        makeEntry({ status: 'error', total: 0 }),
      ];
      const health = deriveWorkerHealth(entries);

      expect(health.lastSyncTime).toBeNull();
      expect(health.kvKeyCount).toBeNull();
      expect(health.syncSuccessRate).toBe(0);
    });

    it('WorkerHealthStatus type is well-defined', () => {
      const status: WorkerHealthStatus = {
        cronHistory: [],
        lastSyncTime: '2026-03-01T10:00:00Z',
        kvKeyCount: 50,
        syncSuccessRate: 95,
      };
      expect(status.kvKeyCount).toBe(50);
    });
  });

  // ---- formatRelativeTime ----
  describe('formatRelativeTime', () => {
    it('returns "刚刚" for timestamps less than 60 seconds ago', () => {
      const now = new Date();
      expect(formatRelativeTime(now.toISOString())).toBe('刚刚');
    });

    it('returns "刚刚" for future timestamps', () => {
      const future = new Date(Date.now() + 60000);
      expect(formatRelativeTime(future.toISOString())).toBe('刚刚');
    });

    it('returns minutes for timestamps 1-59 minutes ago', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinAgo.toISOString())).toBe('5 分钟前');
    });

    it('returns hours for timestamps 1-23 hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2 小时前');
    });

    it('returns days for timestamps 24+ hours ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeDaysAgo.toISOString())).toBe('3 天前');
    });
  });
});
