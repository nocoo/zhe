// Pure business logic for xray (Twitter/X) API integration — no React, no DOM.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Predefined xray API base URL presets */
export const XRAY_PRESETS = [
  { label: "Production", url: "https://xray.hexly.ai" },
  { label: "Development", url: "https://xray.dev.hexly.ai" },
] as const;

/** Default base URL when none is configured */
export const XRAY_DEFAULT_URL = XRAY_PRESETS[0].url;

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

/** Media attachment */
export interface XrayTweetMedia {
  id: string;
  type: "PHOTO" | "VIDEO" | "GIF";
  url: string;
  thumbnail_url?: string | undefined;
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
  media?: XrayTweetMedia[] | undefined;
  quoted_tweet?: XrayTweetData | undefined;
  reply_to_id?: string | undefined;
}

/** Full API response envelope (single tweet) */
export interface XrayTweetResponse {
  success: boolean;
  data: XrayTweetData;
}

/** API response envelope for bookmarks (array of tweets) */
export interface XrayBookmarksResponse {
  success: boolean;
  data: XrayTweetData[];
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
    const host = url.hostname.replace(/^(www|mobile)\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;

    // Path: /<username>/status/<id> with optional trailing segments (/photo/1, etc.)
    const match = url.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tweet image extraction
// ---------------------------------------------------------------------------

/**
 * Extract the best preview image URL from tweet media.
 *
 * Priority: first PHOTO url, then first VIDEO/GIF thumbnail_url.
 * Returns null if no usable image is found.
 */
export function extractTweetImageUrl(tweet: XrayTweetData): string | null {
  if (!tweet.media?.length) return null;

  // Prefer PHOTO type — direct image URL
  const photo = tweet.media.find((m) => m.type === "PHOTO");
  if (photo) return photo.url;

  // Fall back to VIDEO/GIF thumbnail
  const withThumb = tweet.media.find((m) => m.thumbnail_url);
  if (withThumb?.thumbnail_url) return withThumb.thumbnail_url;

  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Check whether a string looks like a valid URL */
export function isValidApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Validate xray API config (both fields must be non-empty, URL must be valid) */
export function validateXrayConfig(
  config: Partial<XrayConfig>,
): { valid: true } | { valid: false; error: string } {
  if (!config.apiUrl?.trim()) {
    return { valid: false, error: "API URL 不能为空" };
  }
  if (!isValidApiUrl(config.apiUrl)) {
    return { valid: false, error: "API URL 格式无效" };
  }
  if (!config.apiToken?.trim()) {
    return { valid: false, error: "Token 不能为空" };
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
  if (token.length < 10) return "•".repeat(token.length);
  return token.slice(0, 4) + "•".repeat(token.length - 8) + token.slice(-4);
}

// ---------------------------------------------------------------------------
// API URL builder
// ---------------------------------------------------------------------------

/**
 * Build the full API endpoint URL for fetching a tweet.
 * @param baseUrl  The xray API base URL (e.g. "https://xray.hexly.ai")
 * @param tweetId  The numeric tweet ID
 */
export function buildTweetApiUrl(baseUrl: string, tweetId: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/twitter/tweets/${tweetId}`;
}

/**
 * Build the full API endpoint URL for fetching the authenticated user's bookmarks.
 * @param baseUrl  The xray API base URL (e.g. "https://xray.hexly.ai")
 */
export function buildBookmarksApiUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/twitter/me/bookmarks`;
}

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
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
