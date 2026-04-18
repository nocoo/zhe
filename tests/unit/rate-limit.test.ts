import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  resetRateLimit,
  clearAllRateLimits,
  getRateLimitCount,
  DEFAULT_RATE_LIMIT,
  type RateLimitConfig,
} from "@/lib/api/rate-limit";

describe("Rate Limiting", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  describe("checkRateLimit", () => {
    it("allows requests under the limit", () => {
      const config: RateLimitConfig = { maxRequests: 5, windowMs: 60_000 };

      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit("key-1", config);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(5 - i - 1);
      }
    });

    it("blocks requests over the limit", () => {
      const config: RateLimitConfig = { maxRequests: 3, windowMs: 60_000 };

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        checkRateLimit("key-2", config);
      }

      // Next request should be blocked
      const result = checkRateLimit("key-2", config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("tracks different keys separately", () => {
      const config: RateLimitConfig = { maxRequests: 2, windowMs: 60_000 };

      // Use up limit for key-a
      checkRateLimit("key-a", config);
      checkRateLimit("key-a", config);
      expect(checkRateLimit("key-a", config).allowed).toBe(false);

      // key-b should still have its full limit
      expect(checkRateLimit("key-b", config).allowed).toBe(true);
      expect(checkRateLimit("key-b", config).allowed).toBe(true);
      expect(checkRateLimit("key-b", config).allowed).toBe(false);
    });

    it("returns correct resetAt timestamp", () => {
      const config: RateLimitConfig = { maxRequests: 5, windowMs: 60_000 };
      const before = Math.ceil((Date.now() + 60_000) / 1000);
      const result = checkRateLimit("key-time", config);
      const after = Math.ceil((Date.now() + 60_000) / 1000);

      expect(result.resetAt).toBeGreaterThanOrEqual(before);
      expect(result.resetAt).toBeLessThanOrEqual(after);
    });

    it("returns correct retryAfterSeconds", () => {
      const config: RateLimitConfig = { maxRequests: 1, windowMs: 30_000 };
      checkRateLimit("key-retry", config);
      const result = checkRateLimit("key-retry", config);

      expect(result.retryAfterSeconds).toBe(30);
    });

    it("uses default config when not provided", () => {
      // Make 100 requests (default limit)
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit("key-default");
        expect(result.allowed).toBe(true);
      }

      // 101st should be blocked
      const result = checkRateLimit("key-default");
      expect(result.allowed).toBe(false);
    });

    describe("sliding-window resetAt / retryAfter semantics", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("retryAfterSeconds reflects time until oldest request expires, not full window", () => {
        const config: RateLimitConfig = { maxRequests: 1, windowMs: 30_000 };

        // First call at t=0 fills the bucket
        vi.setSystemTime(new Date(1_700_000_000_000));
        const first = checkRateLimit("key-slide", config);
        expect(first.allowed).toBe(true);

        // 20s later, second call is blocked. The oldest timestamp expires
        // 10s from now, so retryAfter should be ~10s (NOT 30s).
        vi.setSystemTime(new Date(1_700_000_020_000));
        const blocked = checkRateLimit("key-slide", config);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBe(10);
      });

      it("resetAt is anchored to oldest timestamp + windowMs, not now + windowMs", () => {
        const config: RateLimitConfig = { maxRequests: 1, windowMs: 30_000 };

        vi.setSystemTime(new Date(1_700_000_000_000));
        checkRateLimit("key-reset-anchor", config);

        // 20s later
        vi.setSystemTime(new Date(1_700_000_020_000));
        const blocked = checkRateLimit("key-reset-anchor", config);

        // resetAt should be (1_700_000_000_000 + 30_000) / 1000 = 1_700_000_030
        // Old (buggy) behavior would yield (now + windowMs) / 1000 = 1_700_000_050
        expect(blocked.resetAt).toBe(1_700_000_030);
      });
    });
  });

  describe("resetRateLimit", () => {
    it("clears limit for a specific key", () => {
      const config: RateLimitConfig = { maxRequests: 2, windowMs: 60_000 };

      checkRateLimit("key-reset", config);
      checkRateLimit("key-reset", config);
      expect(checkRateLimit("key-reset", config).allowed).toBe(false);

      resetRateLimit("key-reset");

      expect(checkRateLimit("key-reset", config).allowed).toBe(true);
    });

    it("does not affect other keys", () => {
      const config: RateLimitConfig = { maxRequests: 2, windowMs: 60_000 };

      checkRateLimit("key-x", config);
      checkRateLimit("key-y", config);
      checkRateLimit("key-y", config);

      resetRateLimit("key-y");

      expect(getRateLimitCount("key-x", config)).toBe(1);
      expect(getRateLimitCount("key-y", config)).toBe(0);
    });
  });

  describe("clearAllRateLimits", () => {
    it("clears all rate limits", () => {
      const config: RateLimitConfig = { maxRequests: 5, windowMs: 60_000 };

      checkRateLimit("key-1", config);
      checkRateLimit("key-2", config);
      checkRateLimit("key-3", config);

      clearAllRateLimits();

      expect(getRateLimitCount("key-1", config)).toBe(0);
      expect(getRateLimitCount("key-2", config)).toBe(0);
      expect(getRateLimitCount("key-3", config)).toBe(0);
    });
  });

  describe("getRateLimitCount", () => {
    it("returns 0 for unknown keys", () => {
      expect(getRateLimitCount("nonexistent")).toBe(0);
    });

    it("returns current count for known keys", () => {
      const config: RateLimitConfig = { maxRequests: 10, windowMs: 60_000 };

      checkRateLimit("key-count", config);
      checkRateLimit("key-count", config);
      checkRateLimit("key-count", config);

      expect(getRateLimitCount("key-count", config)).toBe(3);
    });
  });

  describe("DEFAULT_RATE_LIMIT", () => {
    it("has sensible defaults", () => {
      expect(DEFAULT_RATE_LIMIT.maxRequests).toBe(100);
      expect(DEFAULT_RATE_LIMIT.windowMs).toBe(60_000);
    });
  });
});
