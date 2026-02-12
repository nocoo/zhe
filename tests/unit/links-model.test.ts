import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildShortUrl,
  stripProtocol,
  isLinkExpired,
  sortLinksByDate,
  topBreakdownEntries,
  hasAnalyticsData,
} from '@/models/links';
import type { Link } from '@/models/types';
import type { AnalyticsStats } from '@/models/types';

// Helper to create a minimal Link fixture
function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 1,
    userId: 'user-1',
    folderId: null,
    originalUrl: 'https://example.com',
    slug: 'abc123',
    isCustom: false,
    expiresAt: null,
    clicks: 0,
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

describe('models/links', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- buildShortUrl ---
  describe('buildShortUrl', () => {
    it('concatenates site url and slug', () => {
      expect(buildShortUrl('https://zhe.to', 'abc')).toBe('https://zhe.to/abc');
    });

    it('handles trailing slash-free base url', () => {
      expect(buildShortUrl('http://localhost:3000', 'test')).toBe(
        'http://localhost:3000/test'
      );
    });
  });

  // --- stripProtocol ---
  describe('stripProtocol', () => {
    it('strips https://', () => {
      expect(stripProtocol('https://example.com')).toBe('example.com');
    });

    it('strips http://', () => {
      expect(stripProtocol('http://example.com/path')).toBe(
        'example.com/path'
      );
    });

    it('leaves non-http URLs unchanged', () => {
      expect(stripProtocol('ftp://example.com')).toBe('ftp://example.com');
    });

    it('returns empty string for empty input', () => {
      expect(stripProtocol('')).toBe('');
    });
  });

  // --- isLinkExpired ---
  describe('isLinkExpired', () => {
    it('returns false when expiresAt is null', () => {
      expect(isLinkExpired(makeLink({ expiresAt: null }))).toBe(false);
    });

    it('returns true when expiresAt is in the past', () => {
      const past = new Date('2020-01-01');
      expect(isLinkExpired(makeLink({ expiresAt: past }))).toBe(true);
    });

    it('returns false when expiresAt is in the future', () => {
      const future = new Date('2099-12-31');
      expect(isLinkExpired(makeLink({ expiresAt: future }))).toBe(false);
    });

    it('returns true when expiresAt equals current time', () => {
      // Mock Date.now to a fixed point and set expiresAt slightly before it
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);
      const justBefore = new Date('2026-06-01T11:59:59Z');
      expect(isLinkExpired(makeLink({ expiresAt: justBefore }))).toBe(true);
      vi.useRealTimers();
    });
  });

  // --- sortLinksByDate ---
  describe('sortLinksByDate', () => {
    it('sorts newest first', () => {
      const old = makeLink({ id: 1, createdAt: new Date('2026-01-01') });
      const mid = makeLink({ id: 2, createdAt: new Date('2026-06-01') });
      const recent = makeLink({ id: 3, createdAt: new Date('2026-12-01') });

      const sorted = sortLinksByDate([old, recent, mid]);
      expect(sorted.map((l) => l.id)).toEqual([3, 2, 1]);
    });

    it('does not mutate the original array', () => {
      const a = makeLink({ id: 1, createdAt: new Date('2026-01-01') });
      const b = makeLink({ id: 2, createdAt: new Date('2026-06-01') });
      const original = [a, b];
      sortLinksByDate(original);
      expect(original[0].id).toBe(1); // unchanged
    });

    it('returns empty array for empty input', () => {
      expect(sortLinksByDate([])).toEqual([]);
    });

    it('handles single element', () => {
      const single = makeLink({ id: 42 });
      expect(sortLinksByDate([single])).toEqual([single]);
    });
  });

  // --- topBreakdownEntries ---
  describe('topBreakdownEntries', () => {
    it('returns top N entries sorted by count desc', () => {
      const breakdown = { Chrome: 50, Firefox: 30, Safari: 80, Edge: 10 };
      const top2 = topBreakdownEntries(breakdown, 2);
      expect(top2).toEqual([
        ['Safari', 80],
        ['Chrome', 50],
      ]);
    });

    it('returns all entries when n exceeds total', () => {
      const breakdown = { Chrome: 10, Firefox: 5 };
      const result = topBreakdownEntries(breakdown, 100);
      expect(result).toEqual([
        ['Chrome', 10],
        ['Firefox', 5],
      ]);
    });

    it('returns empty for empty breakdown', () => {
      expect(topBreakdownEntries({}, 5)).toEqual([]);
    });

    it('handles n = 0', () => {
      expect(topBreakdownEntries({ Chrome: 10 }, 0)).toEqual([]);
    });
  });

  // --- hasAnalyticsData ---
  describe('hasAnalyticsData', () => {
    const emptyStats: AnalyticsStats = {
      totalClicks: 0,
      uniqueCountries: [],
      deviceBreakdown: {},
      browserBreakdown: {},
      osBreakdown: {},
    };

    it('returns false for completely empty stats', () => {
      expect(hasAnalyticsData(emptyStats)).toBe(false);
    });

    it('returns true when totalClicks > 0', () => {
      expect(hasAnalyticsData({ ...emptyStats, totalClicks: 1 })).toBe(true);
    });

    it('returns true when uniqueCountries is non-empty', () => {
      expect(
        hasAnalyticsData({ ...emptyStats, uniqueCountries: ['US'] })
      ).toBe(true);
    });

    it('returns true when deviceBreakdown has entries', () => {
      expect(
        hasAnalyticsData({
          ...emptyStats,
          deviceBreakdown: { desktop: 5 },
        })
      ).toBe(true);
    });

    it('ignores browserBreakdown and osBreakdown for the check', () => {
      // These fields are not checked by hasAnalyticsData
      const stats: AnalyticsStats = {
        totalClicks: 0,
        uniqueCountries: [],
        deviceBreakdown: {},
        browserBreakdown: { Chrome: 10 },
        osBreakdown: { Windows: 10 },
      };
      expect(hasAnalyticsData(stats)).toBe(false);
    });
  });
});
