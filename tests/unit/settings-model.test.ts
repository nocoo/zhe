import { describe, it, expect } from 'vitest';
import {
  serializeLinksForExport,
  parseImportPayload,
  buildFaviconUrl,
  parsePreviewStyle,
  DEFAULT_PREVIEW_STYLE,
  PREVIEW_STYLES,
  type ExportedLink,
} from '@/models/settings';
import type { Link } from '@/models/types';

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
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    ...overrides,
  };
}

describe('models/settings', () => {
  describe('serializeLinksForExport', () => {
    it('returns empty array for empty links', () => {
      expect(serializeLinksForExport([])).toEqual([]);
    });

    it('serializes link fields for export', () => {
      const link = makeLink({
        originalUrl: 'https://example.com/page',
        slug: 'my-slug',
        isCustom: true,
        clicks: 42,
        createdAt: new Date('2026-02-01T12:00:00.000Z'),
      });
      const result = serializeLinksForExport([link]);
      expect(result).toEqual([
        {
          originalUrl: 'https://example.com/page',
          slug: 'my-slug',
          isCustom: true,
          clicks: 42,
          createdAt: '2026-02-01T12:00:00.000Z',
        },
      ]);
    });

    it('strips internal fields (id, userId, folderId, meta*, expiresAt)', () => {
      const link = makeLink({
        id: 99,
        userId: 'secret-user',
        folderId: 'folder-1',
        metaTitle: 'Title',
        metaDescription: 'Desc',
        metaFavicon: 'favicon.ico',
        expiresAt: new Date('2027-01-01'),
      });
      const result = serializeLinksForExport([link]);
      const exported = result[0];
      expect(exported).not.toHaveProperty('id');
      expect(exported).not.toHaveProperty('userId');
      expect(exported).not.toHaveProperty('folderId');
      expect(exported).not.toHaveProperty('metaTitle');
      expect(exported).not.toHaveProperty('metaDescription');
      expect(exported).not.toHaveProperty('metaFavicon');
      expect(exported).not.toHaveProperty('expiresAt');
    });

    it('serializes multiple links preserving order', () => {
      const links = [
        makeLink({ id: 1, slug: 'first' }),
        makeLink({ id: 2, slug: 'second' }),
      ];
      const result = serializeLinksForExport(links);
      expect(result.map((l) => l.slug)).toEqual(['first', 'second']);
    });

    it('handles null clicks as 0', () => {
      const link = makeLink({ clicks: null });
      const result = serializeLinksForExport([link]);
      expect(result[0].clicks).toBe(0);
    });
  });

  describe('parseImportPayload', () => {
    it('returns error for non-array payload', () => {
      const result = parseImportPayload('not an array');
      expect(result.success).toBe(false);
      expect(result.error).toContain('数组');
    });

    it('returns error for null payload', () => {
      const result = parseImportPayload(null);
      expect(result.success).toBe(false);
    });

    it('returns error for empty array', () => {
      const result = parseImportPayload([]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('空');
    });

    it('parses valid exported links', () => {
      const payload: ExportedLink[] = [
        {
          originalUrl: 'https://example.com',
          slug: 'abc',
          isCustom: false,
          clicks: 10,
          createdAt: '2026-01-15T00:00:00.000Z',
        },
      ];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].originalUrl).toBe('https://example.com');
      expect(result.data![0].slug).toBe('abc');
    });

    it('returns error when link missing originalUrl', () => {
      const payload = [{ slug: 'abc', isCustom: false, clicks: 0, createdAt: '2026-01-01' }];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('originalUrl');
    });

    it('returns error when link missing slug', () => {
      const payload = [{ originalUrl: 'https://example.com', isCustom: false, clicks: 0, createdAt: '2026-01-01' }];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('slug');
    });

    it('returns error when originalUrl is not a valid URL', () => {
      const payload = [{ originalUrl: 'not-a-url', slug: 'abc', isCustom: false, clicks: 0, createdAt: '2026-01-01' }];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });

    it('defaults clicks to 0 when missing', () => {
      const payload = [{ originalUrl: 'https://example.com', slug: 'abc', isCustom: true, createdAt: '2026-01-01' }];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(true);
      expect(result.data![0].clicks).toBe(0);
    });

    it('defaults isCustom to false when missing', () => {
      const payload = [{ originalUrl: 'https://example.com', slug: 'abc', clicks: 5, createdAt: '2026-01-01' }];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(true);
      expect(result.data![0].isCustom).toBe(false);
    });

    it('reports the index of the first invalid entry', () => {
      const payload = [
        { originalUrl: 'https://good.com', slug: 'ok', isCustom: false, clicks: 0, createdAt: '2026-01-01' },
        { originalUrl: 'bad', slug: 'fail', isCustom: false, clicks: 0, createdAt: '2026-01-01' },
      ];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('#2');
    });

    it('parses multiple valid entries', () => {
      const payload: ExportedLink[] = [
        { originalUrl: 'https://a.com', slug: 'a', isCustom: false, clicks: 1, createdAt: '2026-01-01' },
        { originalUrl: 'https://b.com', slug: 'b', isCustom: true, clicks: 2, createdAt: '2026-02-01' },
      ];
      const result = parseImportPayload(payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('buildFaviconUrl', () => {
    it('returns favicon.im URL with hostname and larger=true', () => {
      expect(buildFaviconUrl('https://example.com/page')).toBe(
        'https://favicon.im/example.com?larger=true',
      );
    });

    it('extracts hostname from URL with path and query', () => {
      expect(buildFaviconUrl('https://docs.github.com/en/actions?q=1')).toBe(
        'https://favicon.im/docs.github.com?larger=true',
      );
    });

    it('handles http URLs', () => {
      expect(buildFaviconUrl('http://example.org')).toBe(
        'https://favicon.im/example.org?larger=true',
      );
    });

    it('returns null for invalid URLs', () => {
      expect(buildFaviconUrl('not-a-url')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(buildFaviconUrl('')).toBeNull();
    });

    it('handles URLs with ports (hostname only, no port)', () => {
      expect(buildFaviconUrl('https://localhost:3000/api')).toBe(
        'https://favicon.im/localhost?larger=true',
      );
    });
  });

  describe('parsePreviewStyle', () => {
    it('returns "favicon" for "favicon"', () => {
      expect(parsePreviewStyle('favicon')).toBe('favicon');
    });

    it('returns "screenshot" for "screenshot"', () => {
      expect(parsePreviewStyle('screenshot')).toBe('screenshot');
    });

    it('returns default for invalid string', () => {
      expect(parsePreviewStyle('invalid')).toBe(DEFAULT_PREVIEW_STYLE);
    });

    it('returns default for undefined', () => {
      expect(parsePreviewStyle(undefined)).toBe(DEFAULT_PREVIEW_STYLE);
    });

    it('returns default for null', () => {
      expect(parsePreviewStyle(null)).toBe(DEFAULT_PREVIEW_STYLE);
    });

    it('returns default for number', () => {
      expect(parsePreviewStyle(42)).toBe(DEFAULT_PREVIEW_STYLE);
    });
  });

  describe('PREVIEW_STYLES', () => {
    it('contains both style options', () => {
      expect(PREVIEW_STYLES).toEqual(['favicon', 'screenshot']);
    });
  });

  describe('DEFAULT_PREVIEW_STYLE', () => {
    it('is "favicon"', () => {
      expect(DEFAULT_PREVIEW_STYLE).toBe('favicon');
    });
  });
});
