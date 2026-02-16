import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockSlugExists = vi.fn();
vi.mock('@/lib/db', () => ({
  slugExists: (...args: unknown[]) => mockSlugExists(...args),
}));

const mockCreateLink = vi.fn();
const mockGetLinks = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    createLink: mockCreateLink,
    getLinks: mockGetLinks,
  })),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { importLinks, exportLinks } from '@/actions/settings';
import type { ExportedLink } from '@/models/settings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-abc-123';

function authenticatedSession() {
  return { user: { id: FAKE_USER_ID, name: 'Test', email: 'test@test.com' } };
}

function makeExportedLink(overrides: Partial<ExportedLink> = {}): ExportedLink {
  return {
    originalUrl: 'https://example.com',
    slug: 'abc123',
    isCustom: false,
    clicks: 0,
    createdAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

const FAKE_LINK = {
  id: 1,
  userId: FAKE_USER_ID,
  folderId: null,
  originalUrl: 'https://example.com',
  slug: 'abc123',
  isCustom: false,
  expiresAt: null,
  clicks: 0,
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actions/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // importLinks
  // ====================================================================
  describe('importLinks', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await importLinks([makeExportedLink()]);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error for invalid payload (not an array)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await importLinks('not-array' as unknown as ExportedLink[]);

      expect(result.success).toBe(false);
    });

    it('returns error for empty array', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await importLinks([]);

      expect(result.success).toBe(false);
    });

    it('skips links with existing slugs', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSlugExists.mockResolvedValue(true); // all slugs exist
      mockCreateLink.mockResolvedValue(FAKE_LINK);

      const result = await importLinks([makeExportedLink({ slug: 'existing' })]);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(0);
      expect(result.data!.skipped).toBe(1);
      expect(mockCreateLink).not.toHaveBeenCalled();
    });

    it('creates links for new slugs', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSlugExists.mockResolvedValue(false);
      mockCreateLink.mockResolvedValue(FAKE_LINK);

      const result = await importLinks([
        makeExportedLink({ slug: 'new-slug', originalUrl: 'https://new.com' }),
      ]);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(1);
      expect(result.data!.skipped).toBe(0);
      expect(mockCreateLink).toHaveBeenCalledWith({
        originalUrl: 'https://new.com',
        slug: 'new-slug',
        isCustom: false,
        clicks: 0,
      });
    });

    it('handles mixed existing and new slugs', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      // First slug exists, second is new
      mockSlugExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockCreateLink.mockResolvedValue(FAKE_LINK);

      const result = await importLinks([
        makeExportedLink({ slug: 'existing' }),
        makeExportedLink({ slug: 'new-one', originalUrl: 'https://b.com' }),
      ]);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(1);
      expect(result.data!.skipped).toBe(1);
      expect(mockCreateLink).toHaveBeenCalledTimes(1);
    });

    it('returns error when createLink throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSlugExists.mockResolvedValue(false);
      mockCreateLink.mockRejectedValue(new Error('DB error'));

      const result = await importLinks([makeExportedLink()]);

      expect(result).toEqual({ success: false, error: 'Failed to import links' });
    });

    it('passes isCustom and clicks from payload', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSlugExists.mockResolvedValue(false);
      mockCreateLink.mockResolvedValue(FAKE_LINK);

      await importLinks([
        makeExportedLink({ slug: 's1', isCustom: true, clicks: 42 }),
      ]);

      expect(mockCreateLink).toHaveBeenCalledWith(
        expect.objectContaining({
          isCustom: true,
          clicks: 42,
        }),
      );
    });
  });

  // ====================================================================
  // exportLinks
  // ====================================================================
  describe('exportLinks', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await exportLinks();

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns serialized links on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinks.mockResolvedValue([
        {
          ...FAKE_LINK,
          originalUrl: 'https://example.com',
          slug: 'test',
          isCustom: true,
          clicks: 5,
          createdAt: new Date('2026-01-15T00:00:00.000Z'),
        },
      ]);

      const result = await exportLinks();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        {
          originalUrl: 'https://example.com',
          slug: 'test',
          isCustom: true,
          clicks: 5,
          createdAt: '2026-01-15T00:00:00.000Z',
        },
      ]);
    });

    it('returns error when getLinks throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinks.mockRejectedValue(new Error('DB error'));

      const result = await exportLinks();

      expect(result).toEqual({ success: false, error: 'Failed to export links' });
    });
  });
});
