import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockFetchMetadata = vi.fn();
vi.mock('@/lib/metadata', () => ({
  fetchMetadata: (...args: unknown[]) => mockFetchMetadata(...args),
}));

const mockUpdateLinkMetadata = vi.fn();
vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    updateLinkMetadata: mockUpdateLinkMetadata,
  })),
}));

const mockFetchAndCacheTweet = vi.fn();
const mockForceRefreshTweetCache = vi.fn();
vi.mock('@/actions/xray', () => ({
  fetchAndCacheTweet: (...args: unknown[]) => mockFetchAndCacheTweet(...args),
  forceRefreshTweetCache: (...args: unknown[]) => mockForceRefreshTweetCache(...args),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { enrichLink, refreshLinkEnrichment } from '@/actions/enrichment';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-abc-123';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actions/enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Strategy resolution — enrichLink
  // ====================================================================
  describe('enrichLink — strategy resolution', () => {
    it('delegates twitter URLs to the twitter strategy', async () => {
      mockFetchAndCacheTweet.mockResolvedValue(undefined);

      await enrichLink('https://x.com/user/status/123456', 1, FAKE_USER_ID);

      expect(mockFetchAndCacheTweet).toHaveBeenCalledWith(
        'https://x.com/user/status/123456',
        1,
      );
      expect(mockFetchMetadata).not.toHaveBeenCalled();
    });

    it('delegates twitter.com URLs to the twitter strategy', async () => {
      mockFetchAndCacheTweet.mockResolvedValue(undefined);

      await enrichLink('https://twitter.com/user/status/789', 2, FAKE_USER_ID);

      expect(mockFetchAndCacheTweet).toHaveBeenCalledWith(
        'https://twitter.com/user/status/789',
        2,
      );
      expect(mockFetchMetadata).not.toHaveBeenCalled();
    });

    it('delegates www.x.com URLs to the twitter strategy', async () => {
      mockFetchAndCacheTweet.mockResolvedValue(undefined);

      await enrichLink('https://www.x.com/user/status/123', 3, FAKE_USER_ID);

      expect(mockFetchAndCacheTweet).toHaveBeenCalledWith(
        'https://www.x.com/user/status/123',
        3,
      );
    });

    it('delegates mobile.twitter.com URLs to the twitter strategy', async () => {
      mockFetchAndCacheTweet.mockResolvedValue(undefined);

      await enrichLink('https://mobile.twitter.com/user/status/456', 4, FAKE_USER_ID);

      expect(mockFetchAndCacheTweet).toHaveBeenCalledWith(
        'https://mobile.twitter.com/user/status/456',
        4,
      );
    });

    it('delegates non-twitter URLs to the default metadata strategy', async () => {
      mockFetchMetadata.mockResolvedValue({
        title: 'Example',
        description: 'A page',
        favicon: 'https://example.com/favicon.ico',
      });

      await enrichLink('https://example.com', 5, FAKE_USER_ID);

      expect(mockFetchMetadata).toHaveBeenCalledWith('https://example.com');
      expect(mockUpdateLinkMetadata).toHaveBeenCalledWith(5, {
        metaTitle: 'Example',
        metaDescription: 'A page',
        metaFavicon: 'https://example.com/favicon.ico',
      });
      expect(mockFetchAndCacheTweet).not.toHaveBeenCalled();
    });

    it('does not treat x.com profile URLs as twitter status URLs', async () => {
      mockFetchMetadata.mockResolvedValue({
        title: 'Profile',
        description: null,
        favicon: null,
      });

      await enrichLink('https://x.com/user', 6, FAKE_USER_ID);

      // Profile URL should NOT go to twitter strategy
      expect(mockFetchAndCacheTweet).not.toHaveBeenCalled();
      // Should go to default metadata strategy
      expect(mockFetchMetadata).toHaveBeenCalledWith('https://x.com/user');
    });

    it('does not update metadata when all values are null', async () => {
      mockFetchMetadata.mockResolvedValue({
        title: null,
        description: null,
        favicon: null,
      });

      await enrichLink('https://example.com', 7, FAKE_USER_ID);

      expect(mockFetchMetadata).toHaveBeenCalled();
      expect(mockUpdateLinkMetadata).not.toHaveBeenCalled();
    });

    it('updates metadata when at least one value is non-null', async () => {
      mockFetchMetadata.mockResolvedValue({
        title: 'Only Title',
        description: null,
        favicon: null,
      });

      await enrichLink('https://example.com', 8, FAKE_USER_ID);

      expect(mockUpdateLinkMetadata).toHaveBeenCalledWith(8, {
        metaTitle: 'Only Title',
        metaDescription: null,
        metaFavicon: null,
      });
    });
  });

  // ====================================================================
  // Strategy resolution — refreshLinkEnrichment
  // ====================================================================
  describe('refreshLinkEnrichment — strategy resolution', () => {
    it('delegates twitter URLs to the twitter refresh strategy', async () => {
      mockForceRefreshTweetCache.mockResolvedValue({ success: true });

      const result = await refreshLinkEnrichment(
        'https://x.com/user/status/123456',
        1,
        FAKE_USER_ID,
      );

      expect(result).toEqual({ success: true });
      expect(mockForceRefreshTweetCache).toHaveBeenCalledWith(
        'https://x.com/user/status/123456',
        1,
      );
      expect(mockFetchMetadata).not.toHaveBeenCalled();
    });

    it('returns error when twitter refresh strategy fails', async () => {
      mockForceRefreshTweetCache.mockResolvedValue({
        success: false,
        error: 'Tweet not found',
      });

      const result = await refreshLinkEnrichment(
        'https://x.com/user/status/999',
        2,
        FAKE_USER_ID,
      );

      expect(result).toEqual({ success: false, error: 'Tweet not found' });
    });

    it('returns generic error when twitter refresh returns no error message', async () => {
      mockForceRefreshTweetCache.mockResolvedValue({ success: false });

      const result = await refreshLinkEnrichment(
        'https://x.com/user/status/999',
        3,
        FAKE_USER_ID,
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to refresh tweet metadata',
      });
    });

    it('delegates non-twitter URLs to the default refresh strategy', async () => {
      mockFetchMetadata.mockResolvedValue({
        title: 'Refreshed',
        description: 'Desc',
        favicon: 'https://example.com/icon.png',
      });

      const result = await refreshLinkEnrichment(
        'https://example.com',
        4,
        FAKE_USER_ID,
      );

      expect(result).toEqual({ success: true });
      expect(mockFetchMetadata).toHaveBeenCalledWith('https://example.com');
      expect(mockUpdateLinkMetadata).toHaveBeenCalledWith(4, {
        metaTitle: 'Refreshed',
        metaDescription: 'Desc',
        metaFavicon: 'https://example.com/icon.png',
      });
    });

    it('default refresh updates even when all metadata values are null', async () => {
      // Unlike enrich (fire-and-forget), refresh always writes to DB
      // because user explicitly asked to refresh — clear stale data
      mockFetchMetadata.mockResolvedValue({
        title: null,
        description: null,
        favicon: null,
      });

      const result = await refreshLinkEnrichment(
        'https://example.com',
        5,
        FAKE_USER_ID,
      );

      expect(result).toEqual({ success: true });
      expect(mockUpdateLinkMetadata).toHaveBeenCalledWith(5, {
        metaTitle: null,
        metaDescription: null,
        metaFavicon: null,
      });
    });
  });
});
