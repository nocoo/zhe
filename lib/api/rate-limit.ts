/**
 * Per-Key Rate Limiting
 *
 * In-memory sliding window rate limiter for API key authenticated requests.
 * Each key has its own request counter with a configurable window.
 *
 * The caller is responsible for namespacing keys to avoid collisions
 * (e.g. "api:<keyId>" vs "webhook:<token>").
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

/** Core result returned by the shared sliding window check */
export interface SlidingWindowResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in current window */
  remaining: number;
  /** Unix timestamp (seconds) when the earliest slot opens */
  resetAt: number;
  /** Milliseconds until the earliest slot opens (for Retry-After) */
  retryAfterMs: number;
}

/** Result of a rate limit check (API key layer) */
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

/** In-memory storage for rate limit windows, keyed by namespaced ID */
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
 * Core sliding window check. Shared by both API-key and webhook rate limiters.
 *
 * The caller must namespace `keyId` to avoid collisions between different
 * subsystems (e.g. "api:abc123" vs "webhook:token456").
 *
 * @param keyId - Namespaced key identifier
 * @param maxRequests - Maximum allowed requests within the window
 * @param windowMs - Window duration in milliseconds
 * @returns SlidingWindowResult with precise timing metadata
 */
export function slidingWindowCheck(
  keyId: string,
  maxRequests: number,
  windowMs: number,
): SlidingWindowResult {
  const now = Date.now();

  // Get or create window entry
  let entry = windows.get(keyId);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(keyId, entry);
  }

  // Clean old timestamps
  cleanWindow(entry, windowMs, now);

  const count = entry.timestamps.length;

  if (count >= maxRequests) {
    // Rate limited — calculate when earliest slot frees up
    const oldest = entry.timestamps[0] ?? now;
    const retryAfterMs = Math.max(1, oldest + windowMs - now);
    const resetAt = Math.ceil((oldest + windowMs) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs,
    };
  }

  // Record this request
  entry.timestamps.push(now);

  // Calculate reset based on earliest request in window (after recording)
  const oldest = entry.timestamps[0] ?? now;
  const resetAt = Math.ceil((oldest + windowMs) / 1000);
  const retryAfterMs = Math.max(1, oldest + windowMs - now);
  const remaining = maxRequests - entry.timestamps.length;

  return {
    allowed: true,
    remaining,
    resetAt,
    retryAfterMs,
  };
}

/**
 * Check rate limit for a given key (API key layer).
 *
 * @param keyId - The API key ID to check
 * @param config - Rate limit configuration (optional, uses default if not provided)
 * @returns Rate limit result with allowed status and metadata
 */
export function checkRateLimit(
  keyId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT,
): RateLimitResult {
  const result = slidingWindowCheck(`api:${keyId}`, config.maxRequests, config.windowMs);
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt: result.resetAt,
    retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
  };
}

/**
 * Reset rate limit for a given key.
 * Useful for testing or admin operations.
 */
export function resetRateLimit(keyId: string): void {
  windows.delete(`api:${keyId}`);
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
  const entry = windows.get(`api:${keyId}`);
  if (!entry) return 0;

  cleanWindow(entry, config.windowMs, Date.now());
  return entry.timestamps.length;
}
