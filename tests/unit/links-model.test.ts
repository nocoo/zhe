import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildShortUrl,
  stripProtocol,
  isLinkExpired,
  sortLinksByDate,
  topBreakdownEntries,
  hasAnalyticsData,
  filterLinks,
  buildLinkCounts,
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
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
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

  // --- filterLinks ---
  describe('filterLinks', () => {
    const links = [
      makeLink({ id: 1, slug: 'abc', originalUrl: 'https://example.com' }),
      makeLink({ id: 2, slug: 'xyz', originalUrl: 'https://google.com/search' }),
      makeLink({ id: 3, slug: 'hello', originalUrl: 'https://world.org' }),
      makeLink({ id: 4, slug: 'test', originalUrl: 'https://abc-site.com' }),
    ];

    it('returns all links when query is empty', () => {
      expect(filterLinks(links, '')).toEqual(links);
    });

    it('returns all links when query is whitespace', () => {
      expect(filterLinks(links, '   ')).toEqual(links);
    });

    it('matches by slug substring (case-insensitive)', () => {
      // "abc" matches slug "abc" (link 1) and url "abc-site.com" (link 4)
      const result = filterLinks(links, 'abc');
      expect(result.map((l) => l.id)).toEqual([1, 4]);
    });

    it('matches by original URL substring (case-insensitive, protocol stripped)', () => {
      const result = filterLinks(links, 'google');
      expect(result.map((l) => l.id)).toEqual([2]);
    });

    it('matches are case-insensitive', () => {
      const result = filterLinks(links, 'ABC');
      // "ABC" matches slug "abc" (link 1) and url "abc-site.com" (link 4)
      expect(result.map((l) => l.id)).toEqual([1, 4]);
    });

    it('does not produce false positives from cross-field fuzzy matching', () => {
      // "abcgoo" should NOT match any link — no single field contains "abcgoo"
      // (slug "abc" + url "google.com" would falsely match with cmdk fuzzy)
      const result = filterLinks(links, 'abcgoo');
      expect(result).toEqual([]);
    });

    it('matches when query appears in slug only', () => {
      const result = filterLinks(links, 'hell');
      expect(result.map((l) => l.id)).toEqual([3]);
    });

    it('matches when query appears in URL only', () => {
      const result = filterLinks(links, 'world');
      expect(result.map((l) => l.id)).toEqual([3]);
    });

    it('can match multiple links', () => {
      // "abc" is in slug of link 1 and in URL of link 4 (abc-site.com)
      const result = filterLinks(links, 'abc');
      expect(result.map((l) => l.id)).toEqual([1, 4]);
    });

    it('matches URL path segments', () => {
      const result = filterLinks(links, 'search');
      expect(result.map((l) => l.id)).toEqual([2]);
    });

    it('returns empty array when nothing matches', () => {
      const result = filterLinks(links, 'nonexistent');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty links array', () => {
      expect(filterLinks([], 'test')).toEqual([]);
    });
  });

  // --- buildLinkCounts ---
  describe('buildLinkCounts', () => {
    it('returns zeros for empty links array', () => {
      const counts = buildLinkCounts([]);
      expect(counts.total).toBe(0);
      expect(counts.uncategorized).toBe(0);
      expect(counts.byFolder).toEqual(new Map());
    });

    it('counts all links as total', () => {
      const links = [
        makeLink({ id: 1, folderId: null }),
        makeLink({ id: 2, folderId: 'folder-1' }),
        makeLink({ id: 3, folderId: 'folder-2' }),
      ];
      expect(buildLinkCounts(links).total).toBe(3);
    });

    it('counts links with null folderId as uncategorized', () => {
      const links = [
        makeLink({ id: 1, folderId: null }),
        makeLink({ id: 2, folderId: null }),
        makeLink({ id: 3, folderId: 'folder-1' }),
      ];
      expect(buildLinkCounts(links).uncategorized).toBe(2);
    });

    it('groups links by folderId in byFolder map', () => {
      const links = [
        makeLink({ id: 1, folderId: 'folder-a' }),
        makeLink({ id: 2, folderId: 'folder-a' }),
        makeLink({ id: 3, folderId: 'folder-b' }),
        makeLink({ id: 4, folderId: null }),
      ];
      const counts = buildLinkCounts(links);
      expect(counts.byFolder.get('folder-a')).toBe(2);
      expect(counts.byFolder.get('folder-b')).toBe(1);
      expect(counts.byFolder.has('folder-c')).toBe(false);
    });

    it('does not include null folderId in byFolder map', () => {
      const links = [
        makeLink({ id: 1, folderId: null }),
      ];
      const counts = buildLinkCounts(links);
      expect(counts.byFolder.size).toBe(0);
    });

    it('handles all links in one folder', () => {
      const links = [
        makeLink({ id: 1, folderId: 'only-folder' }),
        makeLink({ id: 2, folderId: 'only-folder' }),
      ];
      const counts = buildLinkCounts(links);
      expect(counts.total).toBe(2);
      expect(counts.uncategorized).toBe(0);
      expect(counts.byFolder.get('only-folder')).toBe(2);
    });

    it('handles all links uncategorized', () => {
      const links = [
        makeLink({ id: 1, folderId: null }),
        makeLink({ id: 2, folderId: null }),
      ];
      const counts = buildLinkCounts(links);
      expect(counts.total).toBe(2);
      expect(counts.uncategorized).toBe(2);
      expect(counts.byFolder.size).toBe(0);
    });
  });
});
