'use server';

import { getScopedDB } from '@/lib/auth-context';
import { ScopedDB } from '@/lib/db/scoped';
import { getTweetCacheById, upsertTweetCache } from '@/lib/db';
import {
  validateXrayConfig,
  maskToken,
  extractTweetId,
  extractTweetImageUrl,
  buildTweetApiUrl,
  buildBookmarksApiUrl,
  MOCK_TWEET_RESPONSE,
  type XrayTweetResponse,
  type XrayTweetData,
  type XrayBookmarksResponse,
} from '@/models/xray';

/** Authenticated GET request to the xray API. */
function xrayFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    headers: { 'accept': 'application/json', 'X-Webhook-Key': token },
  });
}

/** Map XrayTweetData to the shape expected by upsertTweetCache. */
function buildCachePayload(tweet: XrayTweetData) {
  return {
    tweetId: tweet.id,
    authorUsername: tweet.author.username,
    authorName: tweet.author.name,
    authorAvatar: tweet.author.profile_image_url,
    tweetText: tweet.text,
    tweetUrl: tweet.url,
    lang: tweet.lang,
    tweetCreatedAt: tweet.created_at,
    rawData: JSON.stringify(tweet),
  };
}

/** Update link metadata + screenshot from tweet data (fire-and-forget). */
async function updateLinkFromTweet(
  db: ScopedDB,
  linkId: number,
  tweet: XrayTweetData,
): Promise<void> {
  await db.updateLinkMetadata(linkId, {
    metaTitle: `@${tweet.author.username} posted on x.com`,
    metaDescription: tweet.text,
    metaFavicon: tweet.author.profile_image_url,
  });
  const imageUrl = extractTweetImageUrl(tweet);
  if (imageUrl) {
    const { saveScreenshot } = await import('@/actions/links');
    saveScreenshot(linkId, imageUrl).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Get the current xray API config (URL + masked token). */
export async function getXrayConfig(): Promise<{
  success: boolean;
  data?: { apiUrl: string; maskedToken: string };
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getXraySettings();
    if (!config) return { success: true, data: undefined };

    return {
      success: true,
      data: {
        apiUrl: config.apiUrl,
        maskedToken: maskToken(config.apiToken),
      },
    };
  } catch (error) {
    console.error('Failed to get xray config:', error);
    return { success: false, error: 'Failed to load xray config' };
  }
}

/** Save xray API config (URL + token). */
export async function saveXrayConfig(config: {
  apiUrl: string;
  apiToken: string;
}): Promise<{
  success: boolean;
  data?: { apiUrl: string; maskedToken: string };
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const validation = validateXrayConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await db.upsertXraySettings({
      apiUrl: config.apiUrl.trim(),
      apiToken: config.apiToken.trim(),
    });

    return {
      success: true,
      data: {
        apiUrl: config.apiUrl.trim(),
        maskedToken: maskToken(config.apiToken.trim()),
      },
    };
  } catch (error) {
    console.error('Failed to save xray config:', error);
    return { success: false, error: 'Failed to save xray config' };
  }
}

/** Fetch a tweet via the xray API. Uses mock data if API is not configured. */
export async function fetchTweet(tweetUrl: string): Promise<{
  success: boolean;
  data?: XrayTweetResponse;
  mock?: boolean;
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    // Extract tweet ID from the input
    const tweetId = extractTweetId(tweetUrl);
    if (!tweetId) {
      return { success: false, error: '无法从输入中提取 Tweet ID，请检查 URL 格式' };
    }

    // Check if API is configured
    const config = await db.getXraySettings();
    if (!config) {
      // Return mock data when not configured
      return {
        success: true,
        data: MOCK_TWEET_RESPONSE,
        mock: true,
      };
    }

    // Call the real API
    const apiUrl = buildTweetApiUrl(config.apiUrl, tweetId);
    const res = await xrayFetch(apiUrl, config.apiToken);

    if (!res.ok) {
      return {
        success: false,
        error: `API 请求失败 (${res.status})`,
      };
    }

    const data: XrayTweetResponse = await res.json();
    return {
      success: true,
      data,
      mock: false,
    };
  } catch (error) {
    console.error('Failed to fetch tweet:', error);
    return { success: false, error: '获取推文失败' };
  }
}

/** Fetch the authenticated user's bookmarks via the xray API. */
export async function fetchBookmarks(): Promise<{
  success: boolean;
  data?: XrayBookmarksResponse;
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getXraySettings();
    if (!config) {
      return { success: false, error: '请先配置 xray API' };
    }

    const apiUrl = buildBookmarksApiUrl(config.apiUrl);
    const res = await xrayFetch(apiUrl, config.apiToken);

    if (!res.ok) {
      return {
        success: false,
        error: `API 请求失败 (${res.status})`,
      };
    }

    const data: XrayBookmarksResponse = await res.json();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch bookmarks:', error);
    return { success: false, error: '获取书签失败' };
  }
}

// ---------------------------------------------------------------------------
// Cache-aware tweet fetching (for link integration)
// ---------------------------------------------------------------------------

/**
 * Fetch a tweet and cache it. If cached, returns immediately without API call.
 * Optionally updates link metadata if linkId is provided.
 *
 * Called as fire-and-forget from createLink() for X links.
 */
export async function fetchAndCacheTweet(
  tweetUrl: string,
  linkId?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const tweetId = extractTweetId(tweetUrl);
    if (!tweetId) return { success: false, error: 'Invalid tweet URL' };

    // Check cache first
    const cached = await getTweetCacheById(tweetId);
    if (cached) {
      // Cache hit — update link metadata from cache if linkId provided
      if (linkId) {
        const tweet: XrayTweetData = JSON.parse(cached.rawData);
        await updateLinkFromTweet(db, linkId, tweet);
      }
      return { success: true };
    }

    // Cache miss — fetch from API
    const config = await db.getXraySettings();
    if (!config) return { success: false, error: 'xray API not configured' };

    const apiUrl = buildTweetApiUrl(config.apiUrl, tweetId);
    const res = await xrayFetch(apiUrl, config.apiToken);

    if (!res.ok) {
      return { success: false, error: `API request failed (${res.status})` };
    }

    const response: XrayTweetResponse = await res.json();
    const tweet = response.data;

    // Write to cache
    await upsertTweetCache(buildCachePayload(tweet));

    // Update link metadata if linkId provided
    if (linkId) {
      await updateLinkFromTweet(db, linkId, tweet);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to fetch and cache tweet:', error);
    return { success: false, error: 'Failed to fetch tweet' };
  }
}

/**
 * Force-refresh a tweet from the API, bypassing cache.
 * Always calls the API and updates both cache and link metadata.
 *
 * Called from refreshLinkMetadata() for X links.
 */
export async function forceRefreshTweetCache(
  tweetUrl: string,
  linkId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const tweetId = extractTweetId(tweetUrl);
    if (!tweetId) return { success: false, error: 'Invalid tweet URL' };

    const config = await db.getXraySettings();
    if (!config) return { success: false, error: 'xray API not configured' };

    const apiUrl = buildTweetApiUrl(config.apiUrl, tweetId);
    const res = await xrayFetch(apiUrl, config.apiToken);

    if (!res.ok) {
      return { success: false, error: `API request failed (${res.status})` };
    }

    const response: XrayTweetResponse = await res.json();
    const tweet = response.data;

    // Update cache (upsert)
    await upsertTweetCache(buildCachePayload(tweet));

    // Update link metadata + screenshot
    await updateLinkFromTweet(db, linkId, tweet);

    return { success: true };
  } catch (error) {
    console.error('Failed to force refresh tweet cache:', error);
    return { success: false, error: 'Failed to refresh tweet' };
  }
}
