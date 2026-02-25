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

// Global fetch mock
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchAndCacheTweet, forceRefreshTweetCache } from '@/actions/xray';
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
      metaTitle: expect.stringContaining('@karpathy:'),
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
      metaTitle: expect.stringContaining('@karpathy:'),
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

  it('truncates metaTitle at 80 chars with ellipsis', async () => {
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
    const metaTitle = metaCall[1].metaTitle;
    // @karpathy: + 80 chars + ellipsis
    expect(metaTitle).toBe(`@karpathy: ${'A'.repeat(80)}…`);
    // metaDescription should be the full text
    expect(metaCall[1].metaDescription).toBe('A'.repeat(200));
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
      metaTitle: expect.stringContaining('@karpathy:'),
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
});
