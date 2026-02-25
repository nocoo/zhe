import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ScopedDB mock
const mockGetXraySettings = vi.fn();
const mockUpdateLinkMetadata = vi.fn();
const mockGetLinkById = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getXraySettings: mockGetXraySettings,
    updateLinkMetadata: mockUpdateLinkMetadata,
    getLinkById: mockGetLinkById,
  })),
}));

// Public DB mocks
const mockGetTweetCacheById = vi.fn();
const mockUpsertTweetCache = vi.fn();

vi.mock('@/lib/db', () => ({
  getTweetCacheById: (...args: unknown[]) => mockGetTweetCacheById(...args),
  upsertTweetCache: (...args: unknown[]) => mockUpsertTweetCache(...args),
}));

// saveScreenshot mock (dynamically imported by actions/xray)
const mockSaveScreenshot = vi.fn();
vi.mock('@/actions/links', () => ({
  saveScreenshot: (...args: unknown[]) => mockSaveScreenshot(...args),
}));

// Global fetch mock
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchAndCacheTweet, forceRefreshTweetCache, fetchBookmarks } from '@/actions/xray';
import type { XrayTweetData } from '@/models/xray';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_TWEET_DATA: XrayTweetData = {
  id: '2026360908398862478',
  text: 'CLIs are super exciting precisely because they are a "legacy" technology, which means AI agents can natively use them.',
  author: {
    id: '33836629',
    username: 'karpathy',
    name: 'Andrej Karpathy',
    profile_image_url: 'https://pbs.twimg.com/profile_images/test.jpg',
    followers_count: 1826708,
    is_verified: true,
  },
  created_at: '2026-02-24T18:17:43.000Z',
  url: 'https://x.com/karpathy/status/2026360908398862478',
  metrics: {
    retweet_count: 443,
    like_count: 5460,
    reply_count: 340,
    quote_count: 143,
    view_count: 611214,
    bookmark_count: 4292,
  },
  is_retweet: false,
  is_quote: false,
  is_reply: false,
  lang: 'en',
  entities: { hashtags: [], mentioned_users: [], urls: [] },
};

const SAMPLE_TWEET_WITH_PHOTO: XrayTweetData = {
  ...SAMPLE_TWEET_DATA,
  media: [
    { id: 'media-1', type: 'PHOTO', url: 'https://pbs.twimg.com/media/HB8UIepawAAbVKf.jpg' },
  ],
};

const XRAY_CONFIG = {
  apiUrl: 'https://xray.hexly.ai',
  apiToken: 'test-token-123',
};

function mockApiResponse(tweet: XrayTweetData) {
  return {
    ok: true,
    json: () => Promise.resolve({ success: true, data: tweet }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchAndCacheTweet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns error when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await fetchAndCacheTweet('https://x.com/user/status/123');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error for invalid tweet URL', async () => {
    const result = await fetchAndCacheTweet('https://example.com/not-a-tweet');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid tweet URL');
  });

  it('returns success from cache hit without API call', async () => {
    const cached = {
      tweetId: '2026360908398862478',
      authorUsername: 'karpathy',
      rawData: JSON.stringify(SAMPLE_TWEET_DATA),
      fetchedAt: Date.now(),
      updatedAt: Date.now(),
    };
    mockGetTweetCacheById.mockResolvedValue(cached);

    const result = await fetchAndCacheTweet('https://x.com/karpathy/status/2026360908398862478');

    expect(result.success).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGetTweetCacheById).toHaveBeenCalledWith('2026360908398862478');
  });

  it('updates link metadata on cache hit when linkId provided', async () => {
    const cached = {
      tweetId: '2026360908398862478',
      rawData: JSON.stringify(SAMPLE_TWEET_DATA),
    };
    mockGetTweetCacheById.mockResolvedValue(cached);

    const result = await fetchAndCacheTweet(
      'https://x.com/karpathy/status/2026360908398862478',
      42,
    );

    expect(result.success).toBe(true);
    expect(mockUpdateLinkMetadata).toHaveBeenCalledWith(42, {
      metaTitle: '@karpathy posted on x.com',
      metaDescription: SAMPLE_TWEET_DATA.text,
      metaFavicon: SAMPLE_TWEET_DATA.author.profile_image_url,
    });
  });

  it('does NOT update link metadata on cache hit when no linkId', async () => {
    mockGetTweetCacheById.mockResolvedValue({
      tweetId: '123',
      rawData: JSON.stringify(SAMPLE_TWEET_DATA),
    });

    await fetchAndCacheTweet('https://x.com/user/status/123');

    expect(mockUpdateLinkMetadata).not.toHaveBeenCalled();
  });

  it('fetches from API on cache miss', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_DATA));
    mockUpsertTweetCache.mockResolvedValue({});

    const result = await fetchAndCacheTweet(
      'https://x.com/karpathy/status/2026360908398862478',
    );

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://xray.hexly.ai/api/twitter/tweets/2026360908398862478',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Webhook-Key': 'test-token-123',
        }),
      }),
    );
  });

  it('writes to cache after API fetch', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_DATA));
    mockUpsertTweetCache.mockResolvedValue({});

    await fetchAndCacheTweet('https://x.com/karpathy/status/2026360908398862478');

    expect(mockUpsertTweetCache).toHaveBeenCalledWith(
      expect.objectContaining({
        tweetId: '2026360908398862478',
        authorUsername: 'karpathy',
        tweetText: SAMPLE_TWEET_DATA.text,
        rawData: JSON.stringify(SAMPLE_TWEET_DATA),
      }),
    );
  });

  it('updates link metadata after API fetch when linkId provided', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_DATA));
    mockUpsertTweetCache.mockResolvedValue({});

    await fetchAndCacheTweet(
      'https://x.com/karpathy/status/2026360908398862478',
      99,
    );

    expect(mockUpdateLinkMetadata).toHaveBeenCalledWith(99, {
      metaTitle: '@karpathy posted on x.com',
      metaDescription: SAMPLE_TWEET_DATA.text,
      metaFavicon: SAMPLE_TWEET_DATA.author.profile_image_url,
    });
  });

  it('returns error when API is not configured', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(null);

    const result = await fetchAndCacheTweet('https://x.com/user/status/123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('xray API not configured');
  });

  it('returns error when API request fails', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await fetchAndCacheTweet('https://x.com/user/status/123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('API request failed');
  });

  it('uses fixed title format regardless of tweet length', async () => {
    const longTweet = {
      ...SAMPLE_TWEET_DATA,
      text: 'A'.repeat(200),
    };
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(longTweet));
    mockUpsertTweetCache.mockResolvedValue({});

    await fetchAndCacheTweet('https://x.com/karpathy/status/2026360908398862478', 1);

    const metaCall = mockUpdateLinkMetadata.mock.calls[0];
    expect(metaCall[1].metaTitle).toBe('@karpathy posted on x.com');
    // metaDescription should be the full text
    expect(metaCall[1].metaDescription).toBe('A'.repeat(200));
  });

  it('calls saveScreenshot when tweet has PHOTO media (cache miss)', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_WITH_PHOTO));
    mockUpsertTweetCache.mockResolvedValue({});
    mockSaveScreenshot.mockResolvedValue({ success: true });

    await fetchAndCacheTweet('https://x.com/karpathy/status/2026360908398862478', 42);

    expect(mockSaveScreenshot).toHaveBeenCalledWith(
      42,
      'https://pbs.twimg.com/media/HB8UIepawAAbVKf.jpg',
    );
  });

  it('calls saveScreenshot when tweet has PHOTO media (cache hit)', async () => {
    mockGetTweetCacheById.mockResolvedValue({
      tweetId: '2026360908398862478',
      rawData: JSON.stringify(SAMPLE_TWEET_WITH_PHOTO),
    });
    mockSaveScreenshot.mockResolvedValue({ success: true });

    await fetchAndCacheTweet('https://x.com/karpathy/status/2026360908398862478', 42);

    expect(mockSaveScreenshot).toHaveBeenCalledWith(
      42,
      'https://pbs.twimg.com/media/HB8UIepawAAbVKf.jpg',
    );
  });

  it('does NOT call saveScreenshot when tweet has no media', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_DATA));
    mockUpsertTweetCache.mockResolvedValue({});

    await fetchAndCacheTweet('https://x.com/karpathy/status/2026360908398862478', 42);

    expect(mockSaveScreenshot).not.toHaveBeenCalled();
  });

  it('does NOT call saveScreenshot when no linkId', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_WITH_PHOTO));
    mockUpsertTweetCache.mockResolvedValue({});

    await fetchAndCacheTweet('https://x.com/karpathy/status/2026360908398862478');

    expect(mockSaveScreenshot).not.toHaveBeenCalled();
  });

  it('does not fail when saveScreenshot rejects (fire-and-forget)', async () => {
    mockGetTweetCacheById.mockResolvedValue(null);
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_WITH_PHOTO));
    mockUpsertTweetCache.mockResolvedValue({});
    mockSaveScreenshot.mockRejectedValue(new Error('R2 upload failed'));

    const result = await fetchAndCacheTweet(
      'https://x.com/karpathy/status/2026360908398862478',
      42,
    );

    // Should still succeed — screenshot upload is fire-and-forget
    expect(result.success).toBe(true);
  });
});

describe('forceRefreshTweetCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns error when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await forceRefreshTweetCache('https://x.com/user/status/123', 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error for invalid tweet URL', async () => {
    const result = await forceRefreshTweetCache('https://example.com/nope', 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid tweet URL');
  });

  it('always calls API (bypasses cache)', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_DATA));
    mockUpsertTweetCache.mockResolvedValue({});

    await forceRefreshTweetCache(
      'https://x.com/karpathy/status/2026360908398862478',
      42,
    );

    // Should NOT check cache
    expect(mockGetTweetCacheById).not.toHaveBeenCalled();
    // Should call API
    expect(mockFetch).toHaveBeenCalled();
  });

  it('updates cache and link metadata', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_DATA));
    mockUpsertTweetCache.mockResolvedValue({});

    const result = await forceRefreshTweetCache(
      'https://x.com/karpathy/status/2026360908398862478',
      42,
    );

    expect(result.success).toBe(true);
    expect(mockUpsertTweetCache).toHaveBeenCalledWith(
      expect.objectContaining({
        tweetId: '2026360908398862478',
      }),
    );
    expect(mockUpdateLinkMetadata).toHaveBeenCalledWith(42, {
      metaTitle: '@karpathy posted on x.com',
      metaDescription: SAMPLE_TWEET_DATA.text,
      metaFavicon: SAMPLE_TWEET_DATA.author.profile_image_url,
    });
  });

  it('returns error when API is not configured', async () => {
    mockGetXraySettings.mockResolvedValue(null);
    const result = await forceRefreshTweetCache('https://x.com/user/status/123', 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('xray API not configured');
  });

  it('returns error when API request fails', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const result = await forceRefreshTweetCache('https://x.com/user/status/123', 1);

    expect(result.success).toBe(false);
    expect(result.error).toContain('API request failed');
  });

  it('calls saveScreenshot when tweet has PHOTO media', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_WITH_PHOTO));
    mockUpsertTweetCache.mockResolvedValue({});
    mockSaveScreenshot.mockResolvedValue({ success: true });

    await forceRefreshTweetCache(
      'https://x.com/karpathy/status/2026360908398862478',
      42,
    );

    expect(mockSaveScreenshot).toHaveBeenCalledWith(
      42,
      'https://pbs.twimg.com/media/HB8UIepawAAbVKf.jpg',
    );
  });

  it('does NOT call saveScreenshot when tweet has no media', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue(mockApiResponse(SAMPLE_TWEET_DATA));
    mockUpsertTweetCache.mockResolvedValue({});

    await forceRefreshTweetCache(
      'https://x.com/karpathy/status/2026360908398862478',
      42,
    );

    expect(mockSaveScreenshot).not.toHaveBeenCalled();
  });
});

describe('fetchBookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns error when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await fetchBookmarks();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error when API is not configured', async () => {
    mockGetXraySettings.mockResolvedValue(null);
    const result = await fetchBookmarks();
    expect(result.success).toBe(false);
    expect(result.error).toContain('配置');
  });

  it('calls correct bookmarks endpoint with auth header', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [SAMPLE_TWEET_DATA] }),
    });

    await fetchBookmarks();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://xray.hexly.ai/api/twitter/me/bookmarks',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-Webhook-Key': 'test-token-123',
          'accept': 'application/json',
        }),
      }),
    );
  });

  it('returns bookmarks data on success', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    const bookmarksResponse = { success: true, data: [SAMPLE_TWEET_DATA] };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(bookmarksResponse),
    });

    const result = await fetchBookmarks();

    expect(result.success).toBe(true);
    expect(result.data).toEqual(bookmarksResponse);
    expect(result.data!.data).toHaveLength(1);
    expect(result.data!.data[0].id).toBe('2026360908398862478');
  });

  it('returns error when API request fails', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    const result = await fetchBookmarks();

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });

  it('returns error on network failure', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fetchBookmarks();

    expect(result.success).toBe(false);
    expect(result.error).toContain('书签');
  });

  it('handles empty bookmarks list', async () => {
    mockGetXraySettings.mockResolvedValue(XRAY_CONFIG);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    const result = await fetchBookmarks();

    expect(result.success).toBe(true);
    expect(result.data!.data).toHaveLength(0);
  });
});
