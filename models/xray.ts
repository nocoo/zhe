// Pure business logic for xray (Twitter/X) API integration — no React, no DOM.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** xray API configuration stored in user_settings */
export interface XrayConfig {
  apiUrl: string;
  apiToken: string;
}

/** Tweet author */
export interface XrayTweetAuthor {
  id: string;
  username: string;
  name: string;
  profile_image_url: string;
  followers_count: number;
  is_verified: boolean;
}

/** Tweet engagement metrics */
export interface XrayTweetMetrics {
  retweet_count: number;
  like_count: number;
  reply_count: number;
  quote_count: number;
  view_count: number;
  bookmark_count: number;
}

/** Tweet entities */
export interface XrayTweetEntities {
  hashtags: string[];
  mentioned_users: string[];
  urls: string[];
}

/** Tweet data returned by the API */
export interface XrayTweetData {
  id: string;
  text: string;
  author: XrayTweetAuthor;
  created_at: string;
  url: string;
  metrics: XrayTweetMetrics;
  is_retweet: boolean;
  is_quote: boolean;
  is_reply: boolean;
  lang: string;
  entities: XrayTweetEntities;
}

/** Full API response envelope */
export interface XrayTweetResponse {
  success: boolean;
  data: XrayTweetData;
}

// ---------------------------------------------------------------------------
// Tweet ID extraction
// ---------------------------------------------------------------------------

/**
 * Extract a tweet ID from a URL or raw ID string.
 *
 * Supported formats:
 * - https://x.com/user/status/123456789
 * - https://twitter.com/user/status/123456789
 * - https://mobile.twitter.com/user/status/123456789
 * - Pure numeric ID: 123456789
 *
 * Returns null if the input cannot be parsed.
 */
export function extractTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pure numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  // URL pattern: x.com or twitter.com /user/status/ID
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^(www|mobile)\./, '');
    if (host !== 'x.com' && host !== 'twitter.com') return null;

    // Path: /<username>/status/<id> with optional trailing segments (/photo/1, etc.)
    const match = url.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Check whether a string looks like a valid URL */
export function isValidApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Validate xray API config (both fields must be non-empty, URL must be valid) */
export function validateXrayConfig(
  config: Partial<XrayConfig>,
): { valid: true } | { valid: false; error: string } {
  if (!config.apiUrl?.trim()) {
    return { valid: false, error: 'API URL 不能为空' };
  }
  if (!isValidApiUrl(config.apiUrl)) {
    return { valid: false, error: 'API URL 格式无效' };
  }
  if (!config.apiToken?.trim()) {
    return { valid: false, error: 'Token 不能为空' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Token masking
// ---------------------------------------------------------------------------

/**
 * Mask a token for display: show first 4 and last 4 chars, mask the rest.
 * Tokens shorter than 10 chars are fully masked.
 */
export function maskToken(token: string): string {
  if (token.length < 10) return '•'.repeat(token.length);
  return token.slice(0, 4) + '•'.repeat(token.length - 8) + token.slice(-4);
}

// ---------------------------------------------------------------------------
// API URL builder
// ---------------------------------------------------------------------------

/**
 * Build the full API endpoint URL for fetching a tweet.
 * @param baseUrl  The xray API base URL (e.g. "http://localhost:7027")
 * @param tweetId  The numeric tweet ID
 */
export function buildTweetApiUrl(baseUrl: string, tweetId: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/twitter/tweets/${tweetId}`;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** Mock tweet response for testing before the real API is available */
export const MOCK_TWEET_RESPONSE: XrayTweetResponse = {
  success: true,
  data: {
    id: '2026125563673612595',
    text: 'GitHub 2天 500+ \n\nKalshi-Claw\n一个 Kalshi 交易平台的自动化工具,用TypeScript写的，主要功能是自动分析市场趋势、执行事件驱动型交易。\n\nhttps://t.co/DjyKxfAQfY',
    author: {
      id: '1998006140286935041',
      username: 'QingQ77',
      name: 'Geek Lite',
      profile_image_url:
        'https://pbs.twimg.com/profile_images/2004028412730789892/4IFUGOl2_normal.jpg',
      followers_count: 8056,
      is_verified: true,
    },
    created_at: '2026-02-24T02:42:32.000Z',
    url: 'https://x.com/QingQ77/status/2026125563673612595',
    metrics: {
      retweet_count: 3,
      like_count: 25,
      reply_count: 0,
      quote_count: 0,
      view_count: 1625,
      bookmark_count: 30,
    },
    is_retweet: false,
    is_quote: false,
    is_reply: false,
    lang: 'zh',
    entities: {
      hashtags: [],
      mentioned_users: [],
      urls: ['https://github.com/Kirubel125/Kalshi-Claw'],
    },
  },
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a number to a compact human-readable string (e.g. 1.2K, 3.4M) */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Format an ISO date string to a locale-friendly display */
export function formatTweetDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
