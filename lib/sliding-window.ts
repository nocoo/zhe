/**
 * Shared sliding window utilities for rate limiting.
 *
 * Provides common functionality for in-memory sliding window rate limiters
 * used across different modules (API key rate limiting, webhook rate limiting).
 */

/**
 * Evict expired entries from a timestamp array (mutates in place).
 *
 * @param timestamps - Array of request timestamps (milliseconds)
 * @param windowMs - Window duration in milliseconds
 * @param now - Current time in milliseconds
 * @returns The mutated timestamps array
 */
export function evictExpiredTimestamps(
  timestamps: number[],
  windowMs: number,
  now: number,
): number[] {
  const windowStart = now - windowMs;

  // Find the index of the first valid (non-expired) timestamp
  const firstValid = timestamps.findIndex((t) => t > windowStart);

  if (firstValid > 0) {
    // Remove all expired entries before the first valid one
    timestamps.splice(0, firstValid);
  } else if (firstValid === -1) {
    // All timestamps are expired
    timestamps.length = 0;
  }

  return timestamps;
}

/**
 * Calculate retry-after time based on the oldest timestamp in the window.
 *
 * @param oldestTimestamp - The oldest request timestamp in the window (ms)
 * @param windowMs - Window duration in milliseconds
 * @param now - Current time in milliseconds
 * @returns Milliseconds until the oldest request expires (min 1ms)
 */
export function calculateRetryAfterMs(
  oldestTimestamp: number,
  windowMs: number,
  now: number,
): number {
  return Math.max(1, oldestTimestamp + windowMs - now);
}

/**
 * Calculate the Unix timestamp (seconds) when the rate limit resets.
 *
 * @param oldestTimestamp - The oldest request timestamp in the window (ms)
 * @param windowMs - Window duration in milliseconds
 * @returns Unix timestamp in seconds when the limit resets
 */
export function calculateResetAt(oldestTimestamp: number, windowMs: number): number {
  return Math.ceil((oldestTimestamp + windowMs) / 1000);
}
