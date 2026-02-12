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

const mockGenerateUniqueSlug = vi.fn();
const mockSanitizeSlug = vi.fn();
vi.mock('@/lib/slug', () => ({
  generateUniqueSlug: (...args: unknown[]) => mockGenerateUniqueSlug(...args),
  sanitizeSlug: (...args: unknown[]) => mockSanitizeSlug(...args),
}));

// ScopedDB mock instance methods
const mockCreateLink = vi.fn();
const mockGetLinks = vi.fn();
const mockDeleteLink = vi.fn();
const mockUpdateLink = vi.fn();
const mockGetAnalyticsStats = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    createLink: mockCreateLink,
    getLinks: mockGetLinks,
    deleteLink: mockDeleteLink,
    updateLink: mockUpdateLink,
    getAnalyticsStats: mockGetAnalyticsStats,
  })),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  createLink,
  getLinks,
  deleteLink,
  updateLink,
  getAnalyticsStats,
} from '@/actions/links';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-abc-123';

function authenticatedSession() {
  return { user: { id: FAKE_USER_ID, name: 'Test', email: 'test@test.com' } };
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
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actions/links — uncovered paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // createLink
  // ====================================================================
  describe('createLink', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns Unauthorized when session has no user', async () => {
      mockAuth.mockResolvedValue({ user: undefined });

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when db.createLink throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGenerateUniqueSlug.mockResolvedValue('abc123');
      mockCreateLink.mockRejectedValue(new Error('DB connection lost'));

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result).toEqual({
        success: false,
        error: 'DB connection lost',
      });
    });

    it('returns generic error message when thrown value is not an Error', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGenerateUniqueSlug.mockResolvedValue('abc123');
      mockCreateLink.mockRejectedValue('string-error');

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result).toEqual({
        success: false,
        error: 'Failed to create link',
      });
    });

    it('returns Invalid URL for malformed URL', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await createLink({ originalUrl: 'not-a-url' });

      expect(result).toEqual({ success: false, error: 'Invalid URL' });
      // Should NOT have attempted to create anything
      expect(mockCreateLink).not.toHaveBeenCalled();
    });

    it('returns error when custom slug is invalid (sanitizeSlug returns null)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSanitizeSlug.mockReturnValue(null);

      const result = await createLink({
        originalUrl: 'https://example.com',
        customSlug: 'login',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid slug format or reserved word',
      });
    });

    it('returns error when custom slug already exists', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSanitizeSlug.mockReturnValue('taken-slug');
      mockSlugExists.mockResolvedValue(true);

      const result = await createLink({
        originalUrl: 'https://example.com',
        customSlug: 'taken-slug',
      });

      expect(result).toEqual({ success: false, error: 'Slug already taken' });
    });

    it('creates link with custom slug on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSanitizeSlug.mockReturnValue('my-link');
      mockSlugExists.mockResolvedValue(false);
      mockCreateLink.mockResolvedValue({ ...FAKE_LINK, slug: 'my-link', isCustom: true });

      const result = await createLink({
        originalUrl: 'https://example.com',
        customSlug: 'my-link',
      });

      expect(result.success).toBe(true);
      expect(result.data?.slug).toBe('my-link');
      expect(mockCreateLink).toHaveBeenCalledWith({
        originalUrl: 'https://example.com',
        slug: 'my-link',
        isCustom: true,
        folderId: undefined,
        expiresAt: undefined,
      });
    });

    it('creates link with auto-generated slug on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGenerateUniqueSlug.mockResolvedValue('gen456');
      mockCreateLink.mockResolvedValue({ ...FAKE_LINK, slug: 'gen456' });

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.data?.slug).toBe('gen456');
      expect(mockGenerateUniqueSlug).toHaveBeenCalledWith(expect.any(Function));
      expect(mockCreateLink).toHaveBeenCalledWith({
        originalUrl: 'https://example.com',
        slug: 'gen456',
        isCustom: false,
        folderId: undefined,
        expiresAt: undefined,
      });
    });

    it('passes folderId and expiresAt through to db.createLink', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGenerateUniqueSlug.mockResolvedValue('slug99');
      const expiresAt = new Date('2030-06-15');
      mockCreateLink.mockResolvedValue({ ...FAKE_LINK, folderId: 'folder-1', expiresAt });

      const result = await createLink({
        originalUrl: 'https://example.com',
        folderId: 'folder-1',
        expiresAt,
      });

      expect(result.success).toBe(true);
      expect(mockCreateLink).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: 'folder-1',
          expiresAt,
        }),
      );
    });
  });

  // ====================================================================
  // getLinks
  // ====================================================================
  describe('getLinks', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await getLinks();

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when db.getLinks throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinks.mockRejectedValue(new Error('timeout'));

      const result = await getLinks();

      expect(result).toEqual({ success: false, error: 'Failed to get links' });
    });

    it('returns links on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinks.mockResolvedValue([FAKE_LINK]);

      const result = await getLinks();

      expect(result).toEqual({ success: true, data: [FAKE_LINK] });
    });
  });

  // ====================================================================
  // deleteLink
  // ====================================================================
  describe('deleteLink', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await deleteLink(1);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when db.deleteLink throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteLink.mockRejectedValue(new Error('constraint violation'));

      const result = await deleteLink(1);

      expect(result).toEqual({ success: false, error: 'Failed to delete link' });
    });

    it('returns not found when db.deleteLink returns false', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteLink.mockResolvedValue(false);

      const result = await deleteLink(9999);

      expect(result).toEqual({
        success: false,
        error: 'Link not found or access denied',
      });
    });

    it('returns success when link is deleted', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteLink.mockResolvedValue(true);

      const result = await deleteLink(1);

      expect(result).toEqual({ success: true });
      expect(mockDeleteLink).toHaveBeenCalledWith(1);
    });
  });

  // ====================================================================
  // updateLink
  // ====================================================================
  describe('updateLink', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await updateLink(1, { originalUrl: 'https://new.com' });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns Invalid URL when provided URL is malformed', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await updateLink(1, { originalUrl: 'bad-url' });

      expect(result).toEqual({ success: false, error: 'Invalid URL' });
      expect(mockUpdateLink).not.toHaveBeenCalled();
    });

    it('returns error when db.updateLink throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateLink.mockRejectedValue(new Error('disk full'));

      const result = await updateLink(1, { originalUrl: 'https://new.com' });

      expect(result).toEqual({ success: false, error: 'Failed to update link' });
    });

    it('returns not found when db.updateLink returns null', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateLink.mockResolvedValue(null);

      const result = await updateLink(9999, { originalUrl: 'https://new.com' });

      expect(result).toEqual({
        success: false,
        error: 'Link not found or access denied',
      });
    });

    it('returns updated link on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedLink = { ...FAKE_LINK, originalUrl: 'https://new.com' };
      mockUpdateLink.mockResolvedValue(updatedLink);

      const result = await updateLink(1, { originalUrl: 'https://new.com' });

      expect(result).toEqual({ success: true, data: updatedLink });
      expect(mockUpdateLink).toHaveBeenCalledWith(1, {
        originalUrl: 'https://new.com',
      });
    });

    it('skips URL validation when originalUrl is not provided', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedLink = { ...FAKE_LINK, folderId: 'folder-2' };
      mockUpdateLink.mockResolvedValue(updatedLink);

      const result = await updateLink(1, { folderId: 'folder-2' });

      expect(result.success).toBe(true);
      expect(mockUpdateLink).toHaveBeenCalledWith(1, { folderId: 'folder-2' });
    });
  });

  // ====================================================================
  // getAnalyticsStats
  // ====================================================================
  describe('getAnalyticsStats', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await getAnalyticsStats(1);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when db.getAnalyticsStats throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetAnalyticsStats.mockRejectedValue(new Error('query failed'));

      const result = await getAnalyticsStats(1);

      expect(result).toEqual({
        success: false,
        error: 'Failed to get analytics',
      });
    });

    it('returns stats on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const stats = {
        totalClicks: 42,
        uniqueCountries: ['US', 'DE'],
        deviceBreakdown: { desktop: 30, mobile: 12 },
        browserBreakdown: { Chrome: 25, Firefox: 17 },
        osBreakdown: { macOS: 20, Windows: 22 },
      };
      mockGetAnalyticsStats.mockResolvedValue(stats);

      const result = await getAnalyticsStats(1);

      expect(result).toEqual({ success: true, data: stats });
      expect(mockGetAnalyticsStats).toHaveBeenCalledWith(1);
    });
  });
});
