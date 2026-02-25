import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildShortUrl,
  stripProtocol,
  extractHostname,
  isLinkExpired,
  sortLinksByDate,
  topBreakdownEntries,
  hasAnalyticsData,
  filterLinks,
  buildLinkCounts,
  fetchMicrolinkScreenshot,
  fetchScreenshotDomains,
  isGitHubRepoUrl,
  isTwitterUrl,
  GITHUB_REPO_PREVIEW_URL,
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
    screenshotUrl: null,
    note: null,
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

  // --- extractHostname ---
  describe('extractHostname', () => {
    it('extracts hostname from https URL', () => {
      expect(extractHostname('https://example.com/path')).toBe('example.com');
    });

    it('extracts hostname from http URL', () => {
      expect(extractHostname('http://github.com/user/repo')).toBe('github.com');
    });

    it('extracts hostname with subdomain', () => {
      expect(extractHostname('https://docs.google.com/doc/123')).toBe('docs.google.com');
    });

    it('returns raw URL on parse failure', () => {
      expect(extractHostname('not-a-url')).toBe('not-a-url');
    });

    it('returns raw URL for empty string', () => {
      expect(extractHostname('')).toBe('');
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

    // --- meta, note, tag search ---

    it('matches by metaTitle substring', () => {
      const richLinks = [
        makeLink({ id: 10, slug: 'a', originalUrl: 'https://a.com', metaTitle: 'React Documentation' }),
        makeLink({ id: 11, slug: 'b', originalUrl: 'https://b.com', metaTitle: 'Vue.js Guide' }),
      ];
      const result = filterLinks(richLinks, 'react');
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    it('matches by metaDescription substring', () => {
      const richLinks = [
        makeLink({ id: 10, slug: 'a', originalUrl: 'https://a.com', metaDescription: 'A library for building UIs' }),
        makeLink({ id: 11, slug: 'b', originalUrl: 'https://b.com', metaDescription: 'Server-side rendering' }),
      ];
      const result = filterLinks(richLinks, 'building');
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    it('matches by note substring', () => {
      const richLinks = [
        makeLink({ id: 10, slug: 'a', originalUrl: 'https://a.com', note: 'Important reference for project' }),
        makeLink({ id: 11, slug: 'b', originalUrl: 'https://b.com', note: 'Temporary link' }),
      ];
      const result = filterLinks(richLinks, 'reference');
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    it('matches by tag name when context is provided', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'a', originalUrl: 'https://a.com' }),
        makeLink({ id: 11, slug: 'b', originalUrl: 'https://b.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: 'Frontend', color: '#ff0000', createdAt: new Date() },
          { id: 't2', userId: 'u1', name: 'Backend', color: '#0000ff', createdAt: new Date() },
        ],
        linkTags: [
          { linkId: 10, tagId: 't1' },
          { linkId: 11, tagId: 't2' },
        ],
      };
      const result = filterLinks(taggedLinks, 'frontend', ctx);
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    it('does not match tag names when context is not provided', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'a', originalUrl: 'https://a.com' }),
      ];
      // Without context, tag search is skipped
      const result = filterLinks(taggedLinks, 'frontend');
      expect(result).toEqual([]);
    });

    it('matches across multiple fields (any match returns the link)', () => {
      const richLinks = [
        makeLink({ id: 10, slug: 'docs', originalUrl: 'https://docs.example.com', metaTitle: 'API Reference', note: 'Check weekly' }),
      ];
      // Match by slug
      expect(filterLinks(richLinks, 'docs').map((l) => l.id)).toEqual([10]);
      // Match by metaTitle
      expect(filterLinks(richLinks, 'api ref').map((l) => l.id)).toEqual([10]);
      // Match by note
      expect(filterLinks(richLinks, 'weekly').map((l) => l.id)).toEqual([10]);
    });

    it('tag search is case-insensitive', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'a', originalUrl: 'https://a.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: 'JavaScript', color: '#f7df1e', createdAt: new Date() },
        ],
        linkTags: [
          { linkId: 10, tagId: 't1' },
        ],
      };
      const result = filterLinks(taggedLinks, 'JAVASCRIPT', ctx);
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    it('handles links with null meta fields gracefully', () => {
      const richLinks = [
        makeLink({ id: 10, slug: 'a', originalUrl: 'https://a.com', metaTitle: null, metaDescription: null, note: null }),
      ];
      // Should not throw, and should not match
      const result = filterLinks(richLinks, 'something');
      expect(result).toEqual([]);
    });

    it('matches link with tag even if other fields do not match', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'x', originalUrl: 'https://x.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: 'Design', color: '#00ff00', createdAt: new Date() },
        ],
        linkTags: [
          { linkId: 10, tagId: 't1' },
        ],
      };
      const result = filterLinks(taggedLinks, 'design', ctx);
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    // --- edge cases: protocol exclusion ---

    it('does not match protocol prefix "https" since protocol is stripped', () => {
      const result = filterLinks(
        [makeLink({ id: 1, slug: 'a', originalUrl: 'https://example.com' })],
        'https',
      );
      expect(result).toEqual([]);
    });

    it('does not match "http://" since protocol is stripped', () => {
      const result = filterLinks(
        [makeLink({ id: 1, slug: 'a', originalUrl: 'http://example.com' })],
        'http://',
      );
      expect(result).toEqual([]);
    });

    // --- edge cases: whitespace trimming ---

    it('trims leading and trailing whitespace from query before matching', () => {
      const result = filterLinks(
        [makeLink({ id: 1, slug: 'abc', originalUrl: 'https://example.com' })],
        '  abc  ',
      );
      expect(result.map((l) => l.id)).toEqual([1]);
    });

    // --- edge cases: special characters ---

    it('treats special regex characters as literal in query', () => {
      const linksWithDot = [
        makeLink({ id: 1, slug: 'v1.2.3', originalUrl: 'https://example.com/v1.2.3' }),
        makeLink({ id: 2, slug: 'v1x2y3', originalUrl: 'https://example.com/v1x2y3' }),
      ];
      // "1.2" should only match the literal dot, not regex any-char
      const result = filterLinks(linksWithDot, '1.2');
      expect(result.map((l) => l.id)).toEqual([1]);
    });

    it('handles query with brackets and plus signs', () => {
      const specialLinks = [
        makeLink({ id: 1, slug: 'cpp', originalUrl: 'https://example.com', metaTitle: 'C++ Guide' }),
        makeLink({ id: 2, slug: 'python', originalUrl: 'https://example.com', metaTitle: 'Python Guide' }),
      ];
      const result = filterLinks(specialLinks, 'c++');
      expect(result.map((l) => l.id)).toEqual([1]);
    });

    // --- edge cases: unicode / Chinese characters ---

    it('matches Chinese characters in metaTitle', () => {
      const cnLinks = [
        makeLink({ id: 1, slug: 'docs', originalUrl: 'https://a.com', metaTitle: '前端开发指南' }),
        makeLink({ id: 2, slug: 'api', originalUrl: 'https://b.com', metaTitle: 'API Reference' }),
      ];
      const result = filterLinks(cnLinks, '前端');
      expect(result.map((l) => l.id)).toEqual([1]);
    });

    it('matches Chinese characters in note', () => {
      const cnLinks = [
        makeLink({ id: 1, slug: 'a', originalUrl: 'https://a.com', note: '每周检查这个链接' }),
        makeLink({ id: 2, slug: 'b', originalUrl: 'https://b.com', note: 'Check weekly' }),
      ];
      const result = filterLinks(cnLinks, '每周');
      expect(result.map((l) => l.id)).toEqual([1]);
    });

    it('matches Chinese characters in tag names', () => {
      const cnLinks = [
        makeLink({ id: 1, slug: 'a', originalUrl: 'https://a.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: '设计资源', color: '#ff0000', createdAt: new Date() },
        ],
        linkTags: [{ linkId: 1, tagId: 't1' }],
      };
      const result = filterLinks(cnLinks, '设计', ctx);
      expect(result.map((l) => l.id)).toEqual([1]);
    });

    // --- edge cases: multi-tag on single link ---

    it('matches when link has multiple tags and query matches a non-first tag', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'x', originalUrl: 'https://x.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: 'Frontend', color: '#ff0000', createdAt: new Date() },
          { id: 't2', userId: 'u1', name: 'React', color: '#61dafb', createdAt: new Date() },
          { id: 't3', userId: 'u1', name: 'TypeScript', color: '#3178c6', createdAt: new Date() },
        ],
        linkTags: [
          { linkId: 10, tagId: 't1' },
          { linkId: 10, tagId: 't2' },
          { linkId: 10, tagId: 't3' },
        ],
      };
      // Query matches the third tag
      const result = filterLinks(taggedLinks, 'typescript', ctx);
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    // --- edge cases: empty / orphan context ---

    it('works with empty ctx arrays (tags=[], linkTags=[])', () => {
      const result = filterLinks(
        [makeLink({ id: 1, slug: 'abc', originalUrl: 'https://example.com' })],
        'abc',
        { tags: [], linkTags: [] },
      );
      expect(result.map((l) => l.id)).toEqual([1]);
    });

    it('ignores linkTag entries referencing nonexistent tagId', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'x', originalUrl: 'https://x.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: 'Real', color: '#ff0000', createdAt: new Date() },
        ],
        linkTags: [
          { linkId: 10, tagId: 't1' },
          { linkId: 10, tagId: 'nonexistent' }, // orphan linkTag
        ],
      };
      // Should still match via the valid tag
      const result = filterLinks(taggedLinks, 'real', ctx);
      expect(result.map((l) => l.id)).toEqual([10]);
    });

    it('does not crash when linkTag references nonexistent linkId', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'x', originalUrl: 'https://x.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: 'Orphan', color: '#ff0000', createdAt: new Date() },
        ],
        linkTags: [
          { linkId: 999, tagId: 't1' }, // linkId 999 doesn't exist
        ],
      };
      // Should not crash, and link 10 should not match "orphan"
      const result = filterLinks(taggedLinks, 'orphan', ctx);
      expect(result).toEqual([]);
    });

    it('handles tags with no linkTag references (orphan tags)', () => {
      const taggedLinks = [
        makeLink({ id: 10, slug: 'x', originalUrl: 'https://x.com' }),
      ];
      const ctx = {
        tags: [
          { id: 't1', userId: 'u1', name: 'Unused', color: '#ff0000', createdAt: new Date() },
          { id: 't2', userId: 'u1', name: 'Active', color: '#00ff00', createdAt: new Date() },
        ],
        linkTags: [
          { linkId: 10, tagId: 't2' },
        ],
      };
      // "unused" tag exists but isn't linked to any link
      expect(filterLinks(taggedLinks, 'unused', ctx)).toEqual([]);
      // "active" tag is linked to link 10
      expect(filterLinks(taggedLinks, 'active', ctx).map((l) => l.id)).toEqual([10]);
    });

    // --- edge cases: multiple links matching different fields ---

    it('returns multiple links when each matches via different fields', () => {
      const mixedLinks = [
        makeLink({ id: 1, slug: 'alpha', originalUrl: 'https://one.com', metaTitle: 'Unrelated' }),
        makeLink({ id: 2, slug: 'beta', originalUrl: 'https://two.com', metaDescription: 'alpha reference' }),
        makeLink({ id: 3, slug: 'gamma', originalUrl: 'https://three.com', note: 'see alpha docs' }),
      ];
      // "alpha" matches link 1 (slug), link 2 (metaDescription), link 3 (note)
      const result = filterLinks(mixedLinks, 'alpha');
      expect(result.map((l) => l.id)).toEqual([1, 2, 3]);
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

  // --- fetchMicrolinkScreenshot ---
  describe('fetchMicrolinkScreenshot', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns screenshot URL on successful response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { screenshot: { url: 'https://cdn.microlink.io/shot.png' } },
          }),
          { status: 200 },
        ),
      );

      const result = await fetchMicrolinkScreenshot('https://example.com');
      expect(result).toBe('https://cdn.microlink.io/shot.png');
    });

    it('returns null when response is not ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('error', { status: 500 }),
      );

      const result = await fetchMicrolinkScreenshot('https://example.com');
      expect(result).toBeNull();
    });

    it('returns null when screenshot field is missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), { status: 200 }),
      );

      const result = await fetchMicrolinkScreenshot('https://example.com');
      expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

      const result = await fetchMicrolinkScreenshot('https://example.com');
      expect(result).toBeNull();
    });

    it('passes correct query params to Microlink API', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { screenshot: { url: 'https://cdn.microlink.io/shot.png' } },
          }),
          { status: 200 },
        ),
      );

      await fetchMicrolinkScreenshot('https://example.com/page');

      const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(calledUrl.origin + calledUrl.pathname).toBe('https://api.microlink.io/');
      expect(calledUrl.searchParams.get('url')).toBe('https://example.com/page');
      expect(calledUrl.searchParams.get('screenshot')).toBe('true');
    });
  });

  // --- fetchScreenshotDomains ---
  describe('fetchScreenshotDomains', () => {
    /** Create a mock Response with a custom `url` (which is read-only on real Response). */
    function mockResponse(status: number, url: string): Response {
      const res = new Response(null, { status });
      Object.defineProperty(res, 'url', { value: url, writable: false });
      return res;
    }

    it('returns the final redirected URL on success', async () => {
      const finalUrl = 'https://img.screenshot.domains/github.com/123.webp';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(200, finalUrl),
      );

      const result = await fetchScreenshotDomains('https://github.com');
      expect(result).toBe(finalUrl);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://screenshot.domains/github.com',
        expect.objectContaining({ method: 'HEAD' }),
      );
    });

    it('returns null when response is not ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(404, 'https://screenshot.domains/nonexistent.com'),
      );

      const result = await fetchScreenshotDomains('https://nonexistent.com');
      expect(result).toBeNull();
    });

    it('returns null for invalid URL', async () => {
      const result = await fetchScreenshotDomains('not-a-url');
      expect(result).toBeNull();
    });

    it('returns null when fetch throws (e.g. network error)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

      const result = await fetchScreenshotDomains('https://example.com');
      expect(result).toBeNull();
    });

    it('returns null when fetch times out (AbortError)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      );

      const result = await fetchScreenshotDomains('https://slow-site.com');
      expect(result).toBeNull();
    });

    it('extracts hostname from full URL path', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(200, 'https://img.screenshot.domains/example.com/456.webp'),
      );

      await fetchScreenshotDomains('https://example.com/some/path?q=1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://screenshot.domains/example.com',
        expect.objectContaining({ method: 'HEAD' }),
      );
    });

    it('passes AbortSignal for timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(200, 'https://img.screenshot.domains/example.com/789.webp'),
      );

      await fetchScreenshotDomains('https://example.com');

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const options = callArgs[1] as RequestInit;
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('isGitHubRepoUrl', () => {
    it('matches github.com/owner/repo', () => {
      expect(isGitHubRepoUrl('https://github.com/nocoo/zhe')).toBe(true);
    });

    it('matches github.com/owner/repo with trailing slash', () => {
      expect(isGitHubRepoUrl('https://github.com/nocoo/zhe/')).toBe(true);
    });

    it('matches github.com/owner/repo with deeper path segments', () => {
      expect(isGitHubRepoUrl('https://github.com/microsoft/playwright/tree/main/docs')).toBe(true);
    });

    it('matches www.github.com/owner/repo', () => {
      expect(isGitHubRepoUrl('https://www.github.com/nocoo/zhe')).toBe(true);
    });

    it('matches http:// scheme', () => {
      expect(isGitHubRepoUrl('http://github.com/nocoo/zhe')).toBe(true);
    });

    it('does NOT match bare github.com', () => {
      expect(isGitHubRepoUrl('https://github.com')).toBe(false);
    });

    it('does NOT match github.com/user (profile page, single segment)', () => {
      expect(isGitHubRepoUrl('https://github.com/nocoo')).toBe(false);
    });

    it('does NOT match non-github domains', () => {
      expect(isGitHubRepoUrl('https://gitlab.com/owner/repo')).toBe(false);
    });

    it('does NOT match subdomains other than www', () => {
      expect(isGitHubRepoUrl('https://api.github.com/repos/nocoo/zhe')).toBe(false);
    });

    it('returns false for invalid URLs', () => {
      expect(isGitHubRepoUrl('not-a-url')).toBe(false);
    });
  });

  describe('GITHUB_REPO_PREVIEW_URL', () => {
    it('is a valid URL string', () => {
      expect(GITHUB_REPO_PREVIEW_URL).toMatch(/^https:\/\//);
    });
  });

  describe('isTwitterUrl', () => {
    it('matches x.com tweet URL', () => {
      expect(isTwitterUrl('https://x.com/karpathy/status/2026360908398862478')).toBe(true);
    });

    it('matches twitter.com tweet URL', () => {
      expect(isTwitterUrl('https://twitter.com/elonmusk/status/123456789')).toBe(true);
    });

    it('matches www.x.com tweet URL', () => {
      expect(isTwitterUrl('https://www.x.com/user/status/999')).toBe(true);
    });

    it('matches www.twitter.com tweet URL', () => {
      expect(isTwitterUrl('https://www.twitter.com/user/status/999')).toBe(true);
    });

    it('matches mobile.twitter.com tweet URL', () => {
      expect(isTwitterUrl('https://mobile.twitter.com/user/status/999')).toBe(true);
    });

    it('matches tweet URL with trailing segments (photo/1)', () => {
      expect(isTwitterUrl('https://x.com/user/status/123/photo/1')).toBe(true);
    });

    it('matches tweet URL with query params', () => {
      expect(isTwitterUrl('https://x.com/user/status/123?s=20&t=abc')).toBe(true);
    });

    it('does NOT match bare x.com', () => {
      expect(isTwitterUrl('https://x.com')).toBe(false);
    });

    it('does NOT match x.com profile page', () => {
      expect(isTwitterUrl('https://x.com/karpathy')).toBe(false);
    });

    it('does NOT match x.com non-status paths', () => {
      expect(isTwitterUrl('https://x.com/karpathy/likes')).toBe(false);
    });

    it('does NOT match non-twitter domains', () => {
      expect(isTwitterUrl('https://example.com/user/status/123')).toBe(false);
    });

    it('does NOT match github.com', () => {
      expect(isTwitterUrl('https://github.com/user/status/123')).toBe(false);
    });

    it('returns false for invalid URLs', () => {
      expect(isTwitterUrl('not-a-url')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isTwitterUrl('')).toBe(false);
    });

    it('matches http (non-https) tweet URL', () => {
      expect(isTwitterUrl('http://x.com/user/status/123')).toBe(true);
    });
  });
});
