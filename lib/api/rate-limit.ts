/**
 * Per-Key Rate Limiting
 *
 * In-memory sliding window rate limiter for API key authenticated requests.
 * Each key has its own request counter with a configurable window.
 */

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/** Default rate limit: 100 requests per minute */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60_000, // 1 minute
};

/** Result of a rate limit check */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in current window */
  remaining: number;
  /** Unix timestamp (seconds) when the limit resets */
  resetAt: number;
  /** Seconds until limit resets (for Retry-After header) */
  retryAfterSeconds: number;
}

/**
 * Sliding window entry for a single key.
 * Stores timestamps of recent requests within the window.
 */
interface WindowEntry {
  timestamps: number[];
}

/** In-memory storage for rate limit windows, keyed by API key ID */
const windows = new Map<string, WindowEntry>();

/**
 * Clean up old timestamps from a window entry.
 * Removes timestamps older than the window duration.
 */
function cleanWindow(entry: WindowEntry, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
}

/**
 * Check rate limit for a given key.
 *
 * @param keyId - The API key ID to check
 * @param config - Rate limit configuration (optional, uses default if not provided)
 * @returns Rate limit result with allowed status and metadata
 */
export function checkRateLimit(
  keyId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT,
): RateLimitResult {
  const now = Date.now();
  const { maxRequests, windowMs } = config;

  // Get or create window entry
  let entry = windows.get(keyId);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(keyId, entry);
  }

  // Clean old timestamps
  cleanWindow(entry, windowMs, now);

  // Calculate remaining and reset time
  const count = entry.timestamps.length;
  const remaining = Math.max(0, maxRequests - count);
  const resetAt = Math.ceil((now + windowMs) / 1000);
  const retryAfterSeconds = Math.ceil(windowMs / 1000);

  // Check if allowed
  if (count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: remaining - 1, // Subtract 1 because we just recorded this request
    resetAt,
    retryAfterSeconds,
  };
}

/**
 * Reset rate limit for a given key.
 * Useful for testing or admin operations.
 */
export function resetRateLimit(keyId: string): void {
  windows.delete(keyId);
}

/**
 * Clear all rate limit windows.
 * Useful for testing.
 */
export function clearAllRateLimits(): void {
  windows.clear();
}

/**
 * Get current request count for a key (for monitoring).
 */
export function getRateLimitCount(keyId: string, config: RateLimitConfig = DEFAULT_RATE_LIMIT): number {
  const entry = windows.get(keyId);
  if (!entry) return 0;

  cleanWindow(entry, config.windowMs, Date.now());
  return entry.timestamps.length;
}
