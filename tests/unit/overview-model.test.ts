import { describe, it, expect } from 'vitest';
import {
  formatClickCount,
  formatStorageSize,
  buildClickTrend,
  type OverviewStats,
  type ClickTrendPoint,
  type TopLinkEntry,
} from '@/models/overview';

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

  // ---- Type assertions (compile-time) ----
  it('OverviewStats type is well-defined', () => {
    const stats: OverviewStats = {
      totalLinks: 10,
      totalClicks: 500,
      totalUploads: 20,
      totalStorageBytes: 1048576,
      clickTrend: [{ date: '2026-02-10', clicks: 5 }],
      topLinks: [{ slug: 'abc', originalUrl: 'https://example.com', clicks: 100 }],
      deviceBreakdown: { desktop: 300, mobile: 200 },
      browserBreakdown: { Chrome: 400, Safari: 100 },
      osBreakdown: { macOS: 300, Windows: 200 },
    };
    expect(stats.totalLinks).toBe(10);
  });

  it('ClickTrendPoint type is well-defined', () => {
    const point: ClickTrendPoint = { date: '2026-02-10', clicks: 5 };
    expect(point.date).toBe('2026-02-10');
  });

  it('TopLinkEntry type is well-defined', () => {
    const entry: TopLinkEntry = {
      slug: 'abc',
      originalUrl: 'https://example.com',
      clicks: 100,
    };
    expect(entry.slug).toBe('abc');
  });
});
