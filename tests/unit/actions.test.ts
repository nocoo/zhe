import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockSlugExists = vi.fn();
const mockGetLinkBySlug = vi.fn();
vi.mock('@/lib/db', () => ({
  slugExists: (...args: unknown[]) => mockSlugExists(...args),
  getLinkBySlug: (...args: unknown[]) => mockGetLinkBySlug(...args),
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
const mockUpdateLinkMetadata = vi.fn();
const mockGetLinkById = vi.fn();
const mockGetLinksByIds = vi.fn();
const mockUpdateLinkScreenshot = vi.fn();
const mockUpdateLinkNote = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    createLink: mockCreateLink,
    getLinks: mockGetLinks,
    deleteLink: mockDeleteLink,
    updateLink: mockUpdateLink,
    getAnalyticsStats: mockGetAnalyticsStats,
    updateLinkMetadata: mockUpdateLinkMetadata,
    getLinkById: mockGetLinkById,
    getLinksByIds: mockGetLinksByIds,
    updateLinkScreenshot: mockUpdateLinkScreenshot,
    updateLinkNote: mockUpdateLinkNote,
  })),
}));

const mockEnrichLink = vi.fn();
const mockRefreshLinkEnrichment = vi.fn();
vi.mock('@/actions/enrichment', () => ({
  enrichLink: (...args: unknown[]) => mockEnrichLink(...args),
  refreshLinkEnrichment: (...args: unknown[]) => mockRefreshLinkEnrichment(...args),
}));

const mockUploadBufferToR2 = vi.fn();
vi.mock('@/lib/r2/client', () => ({
  uploadBufferToR2: (...args: unknown[]) => mockUploadBufferToR2(...args),
}));

const mockHashUserId = vi.fn();
const mockGenerateObjectKey = vi.fn();
const mockBuildPublicUrl = vi.fn();
vi.mock('@/models/upload', () => ({
  hashUserId: (...args: unknown[]) => mockHashUserId(...args),
  generateObjectKey: (...args: unknown[]) => mockGenerateObjectKey(...args),
  buildPublicUrl: (...args: unknown[]) => mockBuildPublicUrl(...args),
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
  refreshLinkMetadata,
  batchRefreshLinkMetadata,
  updateLinkNote,
  saveScreenshot,
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
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
  screenshotUrl: null,
  note: null,
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
      expect(mockUpdateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        originalUrl: 'https://new.com',
      }));
    });

    it('skips URL validation when originalUrl is not provided', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedLink = { ...FAKE_LINK, folderId: 'folder-2' };
      mockUpdateLink.mockResolvedValue(updatedLink);

      const result = await updateLink(1, { folderId: 'folder-2' });

      expect(result.success).toBe(true);
      expect(mockUpdateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        folderId: 'folder-2',
      }));
    });

    it('updates slug when provided with valid slug', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSanitizeSlug.mockReturnValue('my-slug');
      mockGetLinkBySlug.mockResolvedValue(null); // not taken
      const updatedLink = { ...FAKE_LINK, slug: 'my-slug', isCustom: true };
      mockUpdateLink.mockResolvedValue(updatedLink);

      const result = await updateLink(1, { slug: 'My-Slug' });

      expect(result.success).toBe(true);
      expect(mockSanitizeSlug).toHaveBeenCalledWith('My-Slug');
      expect(mockGetLinkBySlug).toHaveBeenCalledWith('my-slug');
      expect(mockUpdateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        slug: 'my-slug',
        isCustom: true,
      }));
    });

    it('returns error when slug is invalid', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSanitizeSlug.mockReturnValue(null);

      const result = await updateLink(1, { slug: '!!invalid!!' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
      expect(mockUpdateLink).not.toHaveBeenCalled();
    });

    it('returns error when slug is taken by another link', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSanitizeSlug.mockReturnValue('taken-slug');
      mockGetLinkBySlug.mockResolvedValue({ ...FAKE_LINK, id: 999, slug: 'taken-slug' });

      const result = await updateLink(1, { slug: 'taken-slug' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('This slug is already taken');
      expect(mockUpdateLink).not.toHaveBeenCalled();
    });

    it('allows keeping the same slug (same link id)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockSanitizeSlug.mockReturnValue('abc123');
      mockGetLinkBySlug.mockResolvedValue({ ...FAKE_LINK, id: 1, slug: 'abc123' });
      const updatedLink = { ...FAKE_LINK, slug: 'abc123', isCustom: true };
      mockUpdateLink.mockResolvedValue(updatedLink);

      const result = await updateLink(1, { slug: 'abc123' });

      expect(result.success).toBe(true);
      expect(mockUpdateLink).toHaveBeenCalled();
    });

    it('passes screenshotUrl to db.updateLink', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedLink = { ...FAKE_LINK, screenshotUrl: 'https://img.example.com/shot.png' };
      mockUpdateLink.mockResolvedValue(updatedLink);

      const result = await updateLink(1, { screenshotUrl: 'https://img.example.com/shot.png' });

      expect(result.success).toBe(true);
      expect(mockUpdateLink).toHaveBeenCalledWith(1, expect.objectContaining({ screenshotUrl: 'https://img.example.com/shot.png' }));
    });

    it('allows clearing screenshotUrl with null', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedLink = { ...FAKE_LINK, screenshotUrl: null };
      mockUpdateLink.mockResolvedValue(updatedLink);

      const result = await updateLink(1, { screenshotUrl: null });

      expect(result.success).toBe(true);
      expect(mockUpdateLink).toHaveBeenCalledWith(1, expect.objectContaining({ screenshotUrl: null }));
    });

    it('returns error for invalid screenshotUrl', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await updateLink(1, { screenshotUrl: 'not-a-url' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid screenshot URL');
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

  // ====================================================================
  // createLink — async enrichment
  // ====================================================================
  describe('createLink — enrichment', () => {
    it('triggers async enrichment after successful creation', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGenerateUniqueSlug.mockResolvedValue('slug1');
      const createdLink = { ...FAKE_LINK, id: 10, slug: 'slug1' };
      mockCreateLink.mockResolvedValue(createdLink);
      mockEnrichLink.mockResolvedValue(undefined);

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result.success).toBe(true);
      // Flush the fire-and-forget microtask (dynamic import + enrichLink)
      await vi.waitFor(() => {
        expect(mockEnrichLink).toHaveBeenCalledWith(
          'https://example.com',
          10,
          FAKE_USER_ID,
        );
      });
    });

    it('still returns success even if enrichment fails', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGenerateUniqueSlug.mockResolvedValue('slug2');
      const createdLink = { ...FAKE_LINK, id: 11, slug: 'slug2' };
      mockCreateLink.mockResolvedValue(createdLink);
      mockEnrichLink.mockRejectedValue(new Error('enrichment error'));

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.data?.slug).toBe('slug2');
      // Flush the fire-and-forget microtask (dynamic import + enrichLink)
      await vi.waitFor(() => {
        expect(mockEnrichLink).toHaveBeenCalled();
      });
    });

    it('does not enrich when link creation fails', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGenerateUniqueSlug.mockResolvedValue('slug4');
      mockCreateLink.mockRejectedValue(new Error('DB down'));

      const result = await createLink({ originalUrl: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(mockEnrichLink).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // refreshLinkMetadata
  // ====================================================================
  describe('refreshLinkMetadata', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await refreshLinkMetadata(1);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns not found when link does not exist', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinkById.mockResolvedValue(null);

      const result = await refreshLinkMetadata(9999);

      expect(result).toEqual({
        success: false,
        error: 'Link not found or access denied',
      });
    });

    it('delegates to enrichment strategy and returns updated link', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const existingLink = { ...FAKE_LINK, id: 5 };
      const updatedLink = {
        ...existingLink,
        metaTitle: 'Refreshed Title',
        metaDescription: 'Refreshed Desc',
        metaFavicon: 'https://example.com/icon.png',
      };
      // First call: initial lookup; second call: re-fetch after enrichment
      mockGetLinkById.mockResolvedValueOnce(existingLink).mockResolvedValueOnce(updatedLink);
      mockRefreshLinkEnrichment.mockResolvedValue({ success: true });

      const result = await refreshLinkMetadata(5);

      expect(result).toEqual({ success: true, data: updatedLink });
      expect(mockRefreshLinkEnrichment).toHaveBeenCalledWith(
        'https://example.com',
        5,
        FAKE_USER_ID,
      );
    });

    it('returns error when enrichment strategy fails', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinkById.mockResolvedValue({ ...FAKE_LINK, id: 7 });
      mockRefreshLinkEnrichment.mockResolvedValue({
        success: false,
        error: 'Strategy error',
      });

      const result = await refreshLinkMetadata(7);

      expect(result).toEqual({
        success: false,
        error: 'Strategy error',
      });
    });

    it('returns error when enrichment throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinkById.mockResolvedValue({ ...FAKE_LINK, id: 8 });
      mockRefreshLinkEnrichment.mockRejectedValue(new Error('network timeout'));

      const result = await refreshLinkMetadata(8);

      expect(result).toEqual({
        success: false,
        error: 'Failed to refresh metadata',
      });
    });
  });

  // ====================================================================
  // batchRefreshLinkMetadata
  // ====================================================================
  describe('batchRefreshLinkMetadata', () => {
    it('returns empty array for empty input', async () => {
      const result = await batchRefreshLinkMetadata([]);

      expect(result).toEqual({ success: true, data: [] });
      // Should not even call auth
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('returns error when too many link IDs are provided', async () => {
      const tooManyIds = Array.from({ length: 501 }, (_, i) => i + 1);

      const result = await batchRefreshLinkMetadata(tooManyIds);

      expect(result).toEqual({
        success: false,
        error: 'Too many link IDs (501). Maximum is 500.',
      });
      // Should not even call auth
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('accepts exactly 500 link IDs', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinksByIds.mockResolvedValue([]);
      const maxIds = Array.from({ length: 500 }, (_, i) => i + 1);

      const result = await batchRefreshLinkMetadata(maxIds);

      // Should proceed (returns empty because no links found)
      expect(result).toEqual({ success: true, data: [] });
      expect(mockAuth).toHaveBeenCalled();
    });

    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await batchRefreshLinkMetadata([1, 2]);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns empty array when no links found', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinksByIds.mockResolvedValue([]);

      const result = await batchRefreshLinkMetadata([999, 1000]);

      expect(result).toEqual({ success: true, data: [] });
    });

    it('enriches multiple links and returns updated versions', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const link1 = { ...FAKE_LINK, id: 1 };
      const link2 = { ...FAKE_LINK, id: 2 };
      const updated1 = { ...link1, metaTitle: 'Title 1' };
      const updated2 = { ...link2, metaTitle: 'Title 2' };

      // First call: batch fetch originals; second call: batch re-fetch updated
      mockGetLinksByIds
        .mockResolvedValueOnce([link1, link2])
        .mockResolvedValueOnce([updated1, updated2]);
      mockRefreshLinkEnrichment.mockResolvedValue({ success: true });

      const result = await batchRefreshLinkMetadata([1, 2]);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([updated1, updated2]);
      expect(mockRefreshLinkEnrichment).toHaveBeenCalledTimes(2);
      expect(mockRefreshLinkEnrichment).toHaveBeenCalledWith('https://example.com', 1, FAKE_USER_ID);
      expect(mockRefreshLinkEnrichment).toHaveBeenCalledWith('https://example.com', 2, FAKE_USER_ID);
    });

    it('continues when individual enrichment fails', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const link1 = { ...FAKE_LINK, id: 1 };
      const link2 = { ...FAKE_LINK, id: 2 };
      const updated2 = { ...link2, metaTitle: 'Title 2' };

      mockGetLinksByIds
        .mockResolvedValueOnce([link1, link2])
        .mockResolvedValueOnce([link1, updated2]);

      // First enrichment throws, second succeeds
      mockRefreshLinkEnrichment
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({ success: true });

      const result = await batchRefreshLinkMetadata([1, 2]);

      // Should still succeed overall — enrichment is best-effort
      expect(result.success).toBe(true);
      expect(result.data).toEqual([link1, updated2]);
    });

    it('returns error when batch fetch throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinksByIds.mockRejectedValue(new Error('DB error'));

      const result = await batchRefreshLinkMetadata([1, 2]);

      expect(result).toEqual({
        success: false,
        error: 'Failed to batch refresh metadata',
      });
    });
  });

  // ====================================================================
  // updateLinkNote
  // ====================================================================
  describe('updateLinkNote', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await updateLinkNote(1, 'a note');

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns not found when db.updateLinkNote returns null', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateLinkNote.mockResolvedValue(null);

      const result = await updateLinkNote(9999, 'note');

      expect(result).toEqual({
        success: false,
        error: 'Link not found or access denied',
      });
    });

    it('updates note on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedLink = { ...FAKE_LINK, note: 'my note' };
      mockUpdateLinkNote.mockResolvedValue(updatedLink);

      const result = await updateLinkNote(1, 'my note');

      expect(result).toEqual({ success: true, data: updatedLink });
      expect(mockUpdateLinkNote).toHaveBeenCalledWith(1, 'my note');
    });

    it('clears note by passing null', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateLinkNote.mockResolvedValue(FAKE_LINK);

      const result = await updateLinkNote(1, null);

      expect(result).toEqual({ success: true, data: FAKE_LINK });
      expect(mockUpdateLinkNote).toHaveBeenCalledWith(1, null);
    });

    it('returns error when db.updateLinkNote throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateLinkNote.mockRejectedValue(new Error('DB error'));

      const result = await updateLinkNote(1, 'note');

      expect(result).toEqual({ success: false, error: 'Failed to update link note' });
    });
  });

  // ====================================================================
  // saveScreenshot
  // ====================================================================
  describe('saveScreenshot', () => {
    const MICROLINK_URL = 'https://iad.microlink.io/screenshot.png';
    const R2_PUBLIC_URL = 'https://s.zhe.to/abc123/20260218/uuid.png';
    const FAKE_IMAGE_BYTES = new Uint8Array([137, 80, 78, 71]); // PNG header

    beforeEach(() => {
      process.env.R2_USER_HASH_SALT = 'test-salt';
      process.env.R2_PUBLIC_DOMAIN = 'https://s.zhe.to';
      mockHashUserId.mockResolvedValue('abc123');
      mockGenerateObjectKey.mockReturnValue('abc123/20260218/uuid.png');
      mockBuildPublicUrl.mockReturnValue(R2_PUBLIC_URL);
      mockUploadBufferToR2.mockResolvedValue(undefined);
    });

    afterEach(() => {
      delete process.env.R2_USER_HASH_SALT;
      delete process.env.R2_PUBLIC_DOMAIN;
    });

    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('downloads image, uploads to R2, and stores R2 URL in DB', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const mockFetchResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: vi.fn().mockResolvedValue(FAKE_IMAGE_BYTES.buffer),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));
      const updatedLink = { ...FAKE_LINK, screenshotUrl: R2_PUBLIC_URL };
      mockUpdateLinkScreenshot.mockResolvedValue(updatedLink);

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: true, data: updatedLink });
      // Verify download (with AbortSignal for timeout)
      expect(fetch).toHaveBeenCalledWith(MICROLINK_URL, { signal: expect.any(AbortSignal) });
      // Verify R2 upload
      expect(mockUploadBufferToR2).toHaveBeenCalledWith(
        'abc123/20260218/uuid.png',
        expect.any(Uint8Array),
        'image/png',
      );
      // Verify DB persistence with R2 URL (not Microlink URL)
      expect(mockUpdateLinkScreenshot).toHaveBeenCalledWith(1, R2_PUBLIC_URL);

      vi.unstubAllGlobals();
    });

    it('returns error when screenshot download fails', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'Failed to download screenshot' });
      expect(mockUploadBufferToR2).not.toHaveBeenCalled();
      expect(mockUpdateLinkScreenshot).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('returns error when R2_USER_HASH_SALT is missing', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      delete process.env.R2_USER_HASH_SALT;
      const mockFetchResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: vi.fn().mockResolvedValue(FAKE_IMAGE_BYTES.buffer),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'R2 user hash salt not configured' });

      vi.unstubAllGlobals();
    });

    it('returns error when R2_PUBLIC_DOMAIN is missing', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      delete process.env.R2_PUBLIC_DOMAIN;
      const mockFetchResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: vi.fn().mockResolvedValue(FAKE_IMAGE_BYTES.buffer),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'R2 public domain not configured' });

      vi.unstubAllGlobals();
    });

    it('returns error when link not found', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const mockFetchResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: vi.fn().mockResolvedValue(FAKE_IMAGE_BYTES.buffer),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));
      mockUpdateLinkScreenshot.mockResolvedValue(null);

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'Link not found or access denied' });

      vi.unstubAllGlobals();
    });

    it('returns error when R2 upload throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const mockFetchResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: vi.fn().mockResolvedValue(FAKE_IMAGE_BYTES.buffer),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));
      mockUploadBufferToR2.mockRejectedValue(new Error('R2 timeout'));

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'Failed to save screenshot' });

      vi.unstubAllGlobals();
    });

    it('defaults to image/png when content-type header is missing', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const mockFetchResponse = {
        ok: true,
        headers: new Headers(), // no content-type
        arrayBuffer: vi.fn().mockResolvedValue(FAKE_IMAGE_BYTES.buffer),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));
      const updatedLink = { ...FAKE_LINK, screenshotUrl: R2_PUBLIC_URL };
      mockUpdateLinkScreenshot.mockResolvedValue(updatedLink);

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result.success).toBe(true);
      expect(mockUploadBufferToR2).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Uint8Array),
        'image/png', // fallback
      );

      vi.unstubAllGlobals();
    });

    it('rejects non-HTTPS URLs (SSRF defense)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await saveScreenshot(1, 'http://internal-server/secret');

      expect(result).toEqual({ success: false, error: 'Only HTTPS URLs are allowed' });
    });

    it('rejects invalid URLs (SSRF defense)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await saveScreenshot(1, 'not-a-url');

      expect(result).toEqual({ success: false, error: 'Invalid screenshot URL' });
    });

    it('rejects file:// protocol URLs (SSRF defense)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await saveScreenshot(1, 'file:///etc/passwd');

      expect(result).toEqual({ success: false, error: 'Only HTTPS URLs are allowed' });
    });

    it('rejects oversized screenshots declared via Content-Length', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const mockFetchResponse = {
        ok: true,
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': String(11 * 1024 * 1024), // 11 MB
        }),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'Screenshot too large' });
      expect(mockUploadBufferToR2).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('returns timeout error when fetch is aborted', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      const result = await saveScreenshot(1, MICROLINK_URL);

      expect(result).toEqual({ success: false, error: 'Screenshot download timed out' });

      vi.unstubAllGlobals();
    });
  });
});
