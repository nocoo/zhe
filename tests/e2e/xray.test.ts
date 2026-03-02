/**
 * E2E Xray Twitter Integration Tests
 *
 * Tests the full Xray flow through server actions with the in-memory D1 mock.
 * Validates from the perspective of an authenticated user:
 *   - Config CRUD (save, get, upsert with masked token)
 *   - fetchTweet (mock mode when unconfigured, real API call when configured)
 *   - fetchBookmarks (stub global fetch)
 *   - fetchAndCacheTweet (cache lifecycle: miss → write → hit)
 *   - forceRefreshTweetCache (bypass cache, update link metadata)
 *   - Tweet cache persistence across calls
 *   - Multi-user isolation
 *   - Unauthenticated access denied
 *
 * BDD style — each scenario simulates a real user workflow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearMockStorage } from '../setup';
import { getMockTweetCache } from '../mocks/db-storage';
import type { Link } from '@/lib/db/schema';
import type { XrayTweetData, XrayTweetResponse } from '@/models/xray';

// ---------------------------------------------------------------------------
// Mocks — auth (D1 uses the global mock from setup.ts)
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// saveScreenshot mock (dynamically imported by actions/xray)
// We must preserve the rest of @/actions/links (createLink, getLinks, etc.)
const mockSaveScreenshot = vi.fn();
vi.mock('@/actions/links', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/actions/links')>();
  return {
    ...actual,
    saveScreenshot: (...args: unknown[]) => mockSaveScreenshot(...args),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_A = 'user-xray-e2e-a';
const USER_B = 'user-xray-e2e-b';

function authenticatedAs(userId: string) {
  mockAuth.mockResolvedValue({
    user: { id: userId, name: 'E2E User', email: 'e2e@test.com' },
  });
}

function unauthenticated() {
  mockAuth.mockResolvedValue(null);
}

/** Create a link for the current authenticated user via server action */
async function seedLink(
  url: string,
  opts?: { customSlug?: string },
): Promise<Link> {
  const { createLink } = await import('@/actions/links');
  const result = await createLink({
    originalUrl: url,
    customSlug: opts?.customSlug,
  });
  if (!result.success || !result.data) {
    throw new Error(`Failed to seed link: ${result.error}`);
  }
  return result.data;
}

// Sample tweet data
const SAMPLE_TWEET: XrayTweetData = {
  id: '9990001111222233334',
  text: 'This is a test tweet for E2E xray integration.',
  author: {
    id: '12345678',
    username: 'testuser',
    name: 'Test User',
    profile_image_url: 'https://pbs.twimg.com/profile_images/test_normal.jpg',
    followers_count: 1000,
    is_verified: false,
  },
  created_at: '2026-02-28T12:00:00.000Z',
  url: 'https://x.com/testuser/status/9990001111222233334',
  metrics: {
    retweet_count: 10,
    like_count: 50,
    reply_count: 5,
    quote_count: 2,
    view_count: 5000,
    bookmark_count: 20,
  },
  is_retweet: false,
  is_quote: false,
  is_reply: false,
  lang: 'en',
  entities: { hashtags: [], mentioned_users: [], urls: [] },
};

const SAMPLE_TWEET_WITH_PHOTO: XrayTweetData = {
  ...SAMPLE_TWEET,
  id: '9990001111222244445',
  url: 'https://x.com/testuser/status/9990001111222244445',
  media: [
    { id: 'media-e2e-1', type: 'PHOTO', url: 'https://pbs.twimg.com/media/E2E_TEST.jpg' },
  ],
};

const SECOND_TWEET: XrayTweetData = {
  ...SAMPLE_TWEET,
  id: '8880001111222255556',
  text: 'A second tweet for cache isolation test.',
  url: 'https://x.com/testuser/status/8880001111222255556',
};

const XRAY_CONFIG = {
  apiUrl: 'https://xray.hexly.ai',
  apiToken: 'xray-e2e-token-abcdefghij',
};

function mockFetchOk(data: XrayTweetResponse | { success: boolean; data: XrayTweetData[] }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Xray Twitter integration (E2E)', () => {
  beforeEach(() => {
    clearMockStorage();
    vi.restoreAllMocks();
    // Re-setup the auth mock after restoreAllMocks
    mockAuth.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Auth guard — all 6 actions must reject unauthenticated users
  // =========================================================================
  describe('unauthenticated access', () => {
    it('rejects all 6 server actions', async () => {
      unauthenticated();
      const {
        getXrayConfig,
        saveXrayConfig,
        fetchTweet,
        fetchBookmarks,
        fetchAndCacheTweet,
        forceRefreshTweetCache,
      } = await import('@/actions/xray');

      const results = await Promise.all([
        getXrayConfig(),
        saveXrayConfig({ apiUrl: 'https://x.ai', apiToken: 'tok' }),
        fetchTweet('https://x.com/user/status/123'),
        fetchBookmarks(),
        fetchAndCacheTweet('https://x.com/user/status/123'),
        forceRefreshTweetCache('https://x.com/user/status/123', 1),
      ]);

      for (const r of results) {
        expect(r.success).toBe(false);
        expect(r.error).toBe('Unauthorized');
      }
    });
  });

  // =========================================================================
  // 2. Config CRUD
  // =========================================================================
  describe('config lifecycle', () => {
    it('returns no config initially', async () => {
      authenticatedAs(USER_A);
      const { getXrayConfig } = await import('@/actions/xray');

      const result = await getXrayConfig();
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('saves config and returns masked token', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig } = await import('@/actions/xray');

      const result = await saveXrayConfig(XRAY_CONFIG);

      expect(result.success).toBe(true);
      expect(result.data!.apiUrl).toBe('https://xray.hexly.ai');
      // Token: "xray-e2e-token-abcdefghij" (25 chars)
      // maskToken: first 4 + (25-8)=17 dots + last 4
      expect(result.data!.maskedToken).toBe('xray•••••••••••••••••ghij');
    });

    it('retrieves saved config with masked token', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, getXrayConfig } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);
      const result = await getXrayConfig();

      expect(result.success).toBe(true);
      expect(result.data!.apiUrl).toBe('https://xray.hexly.ai');
      expect(result.data!.maskedToken).toBe('xray•••••••••••••••••ghij');
    });

    it('upserts config (overwrite existing)', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, getXrayConfig } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);
      await saveXrayConfig({
        apiUrl: 'https://xray.dev.hexly.ai',
        apiToken: 'new-token-0123456789',
      });

      const result = await getXrayConfig();
      expect(result.success).toBe(true);
      expect(result.data!.apiUrl).toBe('https://xray.dev.hexly.ai');
      expect(result.data!.maskedToken).toBe('new-••••••••••••6789');
    });

    it('validates empty URL', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig } = await import('@/actions/xray');

      const result = await saveXrayConfig({ apiUrl: '', apiToken: 'tok' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });

    it('validates invalid URL', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig } = await import('@/actions/xray');

      const result = await saveXrayConfig({ apiUrl: 'not-a-url', apiToken: 'tok' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });

    it('validates empty token', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig } = await import('@/actions/xray');

      const result = await saveXrayConfig({ apiUrl: 'https://xray.hexly.ai', apiToken: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Token');
    });

    it('trims whitespace from URL and token', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, getXrayConfig } = await import('@/actions/xray');

      await saveXrayConfig({
        apiUrl: '  https://xray.hexly.ai  ',
        apiToken: '  xray-e2e-token-abcdefghij  ',
      });

      const result = await getXrayConfig();
      expect(result.success).toBe(true);
      expect(result.data!.apiUrl).toBe('https://xray.hexly.ai');
    });
  });

  // =========================================================================
  // 3. fetchTweet
  // =========================================================================
  describe('fetchTweet', () => {
    it('returns mock data when API is not configured', async () => {
      authenticatedAs(USER_A);
      const { fetchTweet } = await import('@/actions/xray');
      const { MOCK_TWEET_RESPONSE } = await import('@/models/xray');

      const result = await fetchTweet('https://x.com/karpathy/status/2026360908398862478');

      expect(result.success).toBe(true);
      expect(result.mock).toBe(true);
      expect(result.data).toEqual(MOCK_TWEET_RESPONSE);
    });

    it('returns error for invalid tweet URL', async () => {
      authenticatedAs(USER_A);
      const { fetchTweet } = await import('@/actions/xray');

      const result = await fetchTweet('https://example.com/not-a-tweet');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tweet ID');
    });

    it('calls real API when configured', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      // Stub global fetch for the xray API call
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });

      try {
        const result = await fetchTweet('https://x.com/testuser/status/9990001111222233334');

        expect(result.success).toBe(true);
        expect(result.mock).toBe(false);
        expect(result.data!.data.id).toBe('9990001111222233334');

        // Verify the correct API URL was called
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'https://xray.hexly.ai/api/twitter/tweets/9990001111222233334',
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Webhook-Key': XRAY_CONFIG.apiToken,
            }),
          }),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns error when API responds with non-ok status', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      try {
        const result = await fetchTweet('https://x.com/user/status/123');
        expect(result.success).toBe(false);
        expect(result.error).toContain('500');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('accepts twitter.com URLs', async () => {
      authenticatedAs(USER_A);
      const { fetchTweet } = await import('@/actions/xray');

      // Without config, returns mock (proves URL was parsed successfully)
      const result = await fetchTweet('https://twitter.com/elonmusk/status/123456');
      expect(result.success).toBe(true);
      expect(result.mock).toBe(true);
    });

    it('accepts raw numeric tweet IDs', async () => {
      authenticatedAs(USER_A);
      const { fetchTweet } = await import('@/actions/xray');

      const result = await fetchTweet('123456789');
      expect(result.success).toBe(true);
      expect(result.mock).toBe(true);
    });
  });

  // =========================================================================
  // 4. fetchBookmarks
  // =========================================================================
  describe('fetchBookmarks', () => {
    it('returns error when API is not configured', async () => {
      authenticatedAs(USER_A);
      const { fetchBookmarks } = await import('@/actions/xray');

      const result = await fetchBookmarks();
      expect(result.success).toBe(false);
      expect(result.error).toContain('配置');
    });

    it('fetches bookmarks from correct endpoint', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchBookmarks } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({
        success: true,
        data: [SAMPLE_TWEET, SECOND_TWEET],
      });

      try {
        const result = await fetchBookmarks();

        expect(result.success).toBe(true);
        expect(result.data!.data).toHaveLength(2);

        expect(globalThis.fetch).toHaveBeenCalledWith(
          'https://xray.hexly.ai/api/twitter/me/bookmarks',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'X-Webhook-Key': XRAY_CONFIG.apiToken,
              'accept': 'application/json',
            }),
          }),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles empty bookmarks list', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchBookmarks } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: [] });

      try {
        const result = await fetchBookmarks();
        expect(result.success).toBe(true);
        expect(result.data!.data).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns error when API request fails', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchBookmarks } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

      try {
        const result = await fetchBookmarks();
        expect(result.success).toBe(false);
        expect(result.error).toContain('403');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 5. fetchAndCacheTweet — cache lifecycle
  // =========================================================================
  describe('fetchAndCacheTweet', () => {
    it('returns error for invalid tweet URL', async () => {
      authenticatedAs(USER_A);
      const { fetchAndCacheTweet } = await import('@/actions/xray');

      const result = await fetchAndCacheTweet('not-a-url');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tweet URL');
    });

    it('returns error when API is not configured and cache misses', async () => {
      authenticatedAs(USER_A);
      const { fetchAndCacheTweet } = await import('@/actions/xray');

      const result = await fetchAndCacheTweet('https://x.com/user/status/99999');
      expect(result.success).toBe(false);
      expect(result.error).toBe('xray API not configured');
    });

    it('fetches from API on cache miss and writes to cache', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });

      try {
        const result = await fetchAndCacheTweet(
          'https://x.com/testuser/status/9990001111222233334',
        );
        expect(result.success).toBe(true);

        // Verify tweet was written to cache
        const cache = getMockTweetCache();
        expect(cache.has('9990001111222233334')).toBe(true);
        expect(cache.get('9990001111222233334')!.authorUsername).toBe('testuser');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns from cache on second call without API request', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      const fetchMock = mockFetchOk({ success: true, data: SAMPLE_TWEET });
      globalThis.fetch = fetchMock;

      try {
        // First call — cache miss, API call
        await fetchAndCacheTweet('https://x.com/testuser/status/9990001111222233334');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Second call — cache hit, no API call
        const result = await fetchAndCacheTweet(
          'https://x.com/testuser/status/9990001111222233334',
        );
        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('updates link metadata when linkId is provided (cache miss)', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      // Create a link to associate metadata with
      const link = await seedLink('https://x.com/testuser/status/9990001111222233334', {
        customSlug: 'xray-meta-test',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });

      try {
        const result = await fetchAndCacheTweet(
          'https://x.com/testuser/status/9990001111222233334',
          link.id,
        );
        expect(result.success).toBe(true);

        // Verify link metadata was updated
        const { getLinks } = await import('@/actions/links');
        const links = await getLinks();
        const updated = links.data!.find((l: Link) => l.slug === 'xray-meta-test');
        expect(updated!.metaTitle).toBe('@testuser posted on x.com');
        expect(updated!.metaDescription).toBe(SAMPLE_TWEET.text);
        expect(updated!.metaFavicon).toBe(SAMPLE_TWEET.author.profile_image_url);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('updates link metadata when linkId is provided (cache hit)', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });

      try {
        // Prime the cache
        await fetchAndCacheTweet('https://x.com/testuser/status/9990001111222233334');

        // Create a link and call with linkId
        const link = await seedLink('https://x.com/testuser/status/9990001111222233334', {
          customSlug: 'xray-cache-hit-meta',
        });

        const result = await fetchAndCacheTweet(
          'https://x.com/testuser/status/9990001111222233334',
          link.id,
        );
        expect(result.success).toBe(true);

        // Verify link metadata was updated from cache
        const { getLinks } = await import('@/actions/links');
        const links = await getLinks();
        const updated = links.data!.find((l: Link) => l.slug === 'xray-cache-hit-meta');
        expect(updated!.metaTitle).toBe('@testuser posted on x.com');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('calls saveScreenshot when tweet has PHOTO media', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const link = await seedLink('https://x.com/testuser/status/9990001111222244445', {
        customSlug: 'xray-photo-test',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET_WITH_PHOTO });
      mockSaveScreenshot.mockResolvedValue({ success: true });

      try {
        const result = await fetchAndCacheTweet(
          'https://x.com/testuser/status/9990001111222244445',
          link.id,
        );
        expect(result.success).toBe(true);

        expect(mockSaveScreenshot).toHaveBeenCalledWith(
          link.id,
          'https://pbs.twimg.com/media/E2E_TEST.jpg',
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('does not call saveScreenshot when tweet has no media', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const link = await seedLink('https://x.com/testuser/status/9990001111222233334', {
        customSlug: 'xray-no-media',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });

      try {
        await fetchAndCacheTweet(
          'https://x.com/testuser/status/9990001111222233334',
          link.id,
        );
        expect(mockSaveScreenshot).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('does not fail when saveScreenshot rejects (fire-and-forget)', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const link = await seedLink('https://x.com/testuser/status/9990001111222244445', {
        customSlug: 'xray-screenshot-fail',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET_WITH_PHOTO });
      mockSaveScreenshot.mockRejectedValue(new Error('R2 upload failed'));

      try {
        const result = await fetchAndCacheTweet(
          'https://x.com/testuser/status/9990001111222244445',
          link.id,
        );
        // Should still succeed — screenshot is fire-and-forget
        expect(result.success).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 6. forceRefreshTweetCache
  // =========================================================================
  describe('forceRefreshTweetCache', () => {
    it('returns error for invalid tweet URL', async () => {
      authenticatedAs(USER_A);
      const { forceRefreshTweetCache } = await import('@/actions/xray');

      const result = await forceRefreshTweetCache('garbage', 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tweet URL');
    });

    it('returns error when API is not configured', async () => {
      authenticatedAs(USER_A);
      const { forceRefreshTweetCache } = await import('@/actions/xray');

      const result = await forceRefreshTweetCache('https://x.com/user/status/123', 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('xray API not configured');
    });

    it('bypasses cache and always calls API', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet, forceRefreshTweetCache } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const link = await seedLink('https://x.com/testuser/status/9990001111222233334', {
        customSlug: 'xray-force-refresh',
      });

      const originalFetch = globalThis.fetch;
      const fetchMock = mockFetchOk({ success: true, data: SAMPLE_TWEET });
      globalThis.fetch = fetchMock;

      try {
        // Prime cache
        await fetchAndCacheTweet('https://x.com/testuser/status/9990001111222233334');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Force refresh — should call API again despite cache hit
        const result = await forceRefreshTweetCache(
          'https://x.com/testuser/status/9990001111222233334',
          link.id,
        );
        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2); // API called again
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('updates cache and link metadata', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, forceRefreshTweetCache } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const link = await seedLink('https://x.com/testuser/status/9990001111222233334', {
        customSlug: 'xray-refresh-meta',
      });

      const updatedTweet: XrayTweetData = {
        ...SAMPLE_TWEET,
        text: 'Updated tweet text after force refresh.',
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: updatedTweet });

      try {
        const result = await forceRefreshTweetCache(
          'https://x.com/testuser/status/9990001111222233334',
          link.id,
        );
        expect(result.success).toBe(true);

        // Verify cache was updated
        const cache = getMockTweetCache();
        const cached = cache.get('9990001111222233334')!;
        expect(cached.tweetText).toBe('Updated tweet text after force refresh.');

        // Verify link metadata was updated
        const { getLinks } = await import('@/actions/links');
        const links = await getLinks();
        const updated = links.data!.find((l: Link) => l.slug === 'xray-refresh-meta');
        expect(updated!.metaDescription).toBe('Updated tweet text after force refresh.');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns error when API request fails', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, forceRefreshTweetCache } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

      try {
        const result = await forceRefreshTweetCache('https://x.com/user/status/123', 1);
        expect(result.success).toBe(false);
        expect(result.error).toContain('API request failed');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 7. Tweet cache persistence — different tweets get separate cache entries
  // =========================================================================
  describe('tweet cache persistence', () => {
    it('caches multiple tweets independently', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;

      // Fetch first tweet
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });
      await fetchAndCacheTweet('https://x.com/testuser/status/9990001111222233334');

      // Fetch second tweet
      globalThis.fetch = mockFetchOk({ success: true, data: SECOND_TWEET });
      await fetchAndCacheTweet('https://x.com/testuser/status/8880001111222255556');

      globalThis.fetch = originalFetch;

      const cache = getMockTweetCache();
      expect(cache.size).toBe(2);
      expect(cache.get('9990001111222233334')!.tweetText).toBe(SAMPLE_TWEET.text);
      expect(cache.get('8880001111222255556')!.tweetText).toBe(SECOND_TWEET.text);
    });

    it('upserts cache on force refresh (updates existing entry)', async () => {
      authenticatedAs(USER_A);
      const { saveXrayConfig, fetchAndCacheTweet, forceRefreshTweetCache } =
        await import('@/actions/xray');

      await saveXrayConfig(XRAY_CONFIG);

      const link = await seedLink('https://x.com/testuser/status/9990001111222233334', {
        customSlug: 'xray-upsert-cache',
      });

      const originalFetch = globalThis.fetch;

      // Prime cache
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });
      await fetchAndCacheTweet('https://x.com/testuser/status/9990001111222233334');

      // Force refresh with updated text
      const updatedTweet: XrayTweetData = {
        ...SAMPLE_TWEET,
        text: 'Refreshed text.',
      };
      globalThis.fetch = mockFetchOk({ success: true, data: updatedTweet });
      await forceRefreshTweetCache(
        'https://x.com/testuser/status/9990001111222233334',
        link.id,
      );

      globalThis.fetch = originalFetch;

      // Cache should have updated text, not old text
      const cache = getMockTweetCache();
      expect(cache.size).toBe(1); // Still 1 entry, not 2
      expect(cache.get('9990001111222233334')!.tweetText).toBe('Refreshed text.');
    });
  });

  // =========================================================================
  // 8. Multi-user isolation — configs are per-user
  // =========================================================================
  describe('multi-user isolation', () => {
    it('config is isolated per user', async () => {
      const { saveXrayConfig, getXrayConfig } = await import('@/actions/xray');

      // User A saves config
      authenticatedAs(USER_A);
      await saveXrayConfig(XRAY_CONFIG);

      // User B has no config
      authenticatedAs(USER_B);
      const resultB = await getXrayConfig();
      expect(resultB.success).toBe(true);
      expect(resultB.data).toBeUndefined();

      // User A still has config
      authenticatedAs(USER_A);
      const resultA = await getXrayConfig();
      expect(resultA.success).toBe(true);
      expect(resultA.data!.apiUrl).toBe('https://xray.hexly.ai');
    });

    it('tweet cache is shared (global, not per-user)', async () => {
      const { saveXrayConfig, fetchAndCacheTweet } = await import('@/actions/xray');

      // User A configures and fetches a tweet
      authenticatedAs(USER_A);
      await saveXrayConfig(XRAY_CONFIG);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetchOk({ success: true, data: SAMPLE_TWEET });

      await fetchAndCacheTweet('https://x.com/testuser/status/9990001111222233334');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // User B configures same API and fetches same tweet
      authenticatedAs(USER_B);
      await saveXrayConfig({
        apiUrl: 'https://xray.hexly.ai',
        apiToken: 'user-b-token-1234567890',
      });

      // Should hit cache — no additional API call
      const result = await fetchAndCacheTweet(
        'https://x.com/testuser/status/9990001111222233334',
      );
      expect(result.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Still 1 — cache hit

      globalThis.fetch = originalFetch;
    });
  });
});
