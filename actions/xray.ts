'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import {
  validateXrayConfig,
  maskToken,
  extractTweetId,
  buildTweetApiUrl,
  MOCK_TWEET_RESPONSE,
  type XrayTweetResponse,
} from '@/models/xray';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getScopedDB(): Promise<ScopedDB | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return new ScopedDB(userId);
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
  tweetId?: string;
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
        tweetId,
        mock: true,
      };
    }

    // Call the real API
    const apiUrl = buildTweetApiUrl(config.apiUrl, tweetId);
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${config.apiToken}`,
      },
    });

    if (!res.ok) {
      return {
        success: false,
        tweetId,
        error: `API 请求失败 (${res.status})`,
      };
    }

    const data: XrayTweetResponse = await res.json();
    return {
      success: true,
      data,
      tweetId,
      mock: false,
    };
  } catch (error) {
    console.error('Failed to fetch tweet:', error);
    return { success: false, error: '获取推文失败' };
  }
}
