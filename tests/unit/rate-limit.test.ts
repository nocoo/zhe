// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  clearAllRateLimits,
  DEFAULT_RATE_LIMIT,
  getRateLimitCount,
  resetRateLimit,
  slidingWindowCheck,
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
  });

  describe("retryAfterSeconds — dynamic (fake timers)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retryAfterSeconds reflects time until earliest slot opens", () => {
      const config: RateLimitConfig = { maxRequests: 2, windowMs: 60_000 };

      // t=0: first request
      vi.setSystemTime(0);
      checkRateLimit("key-dynamic", config);

      // t=10s: second request — fills the window
      vi.setSystemTime(10_000);
      checkRateLimit("key-dynamic", config);

      // t=45s: blocked — earliest slot opens at t=60s → retryAfter ≈ 15s
      vi.setSystemTime(45_000);
      const result = checkRateLimit("key-dynamic", config);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(15);
      expect(result.resetAt).toBe(60); // 60000ms / 1000
    });

    it("retryAfterSeconds is 1 when limit expires imminently", () => {
      const config: RateLimitConfig = { maxRequests: 1, windowMs: 60_000 };

      vi.setSystemTime(0);
      checkRateLimit("key-imminent", config);

      // At t=59.5s — 500ms until slot opens → ceil → 1s
      vi.setSystemTime(59_500);
      const result = checkRateLimit("key-imminent", config);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(1);
    });

    it("allows requests again after window expires", () => {
      const config: RateLimitConfig = { maxRequests: 1, windowMs: 60_000 };

      vi.setSystemTime(0);
      checkRateLimit("key-expire", config);

      // t=30s: still blocked
      vi.setSystemTime(30_000);
      expect(checkRateLimit("key-expire", config).allowed).toBe(false);

      // t=60.001s: window expired, slot freed
      vi.setSystemTime(60_001);
      const result = checkRateLimit("key-expire", config);
      expect(result.allowed).toBe(true);
    });

    it("resetAt points to when earliest slot opens (not now + windowMs)", () => {
      const config: RateLimitConfig = { maxRequests: 3, windowMs: 60_000 };

      // Requests at t=5s, t=20s, t=35s
      vi.setSystemTime(5_000);
      checkRateLimit("key-reset", config);
      vi.setSystemTime(20_000);
      checkRateLimit("key-reset", config);
      vi.setSystemTime(35_000);
      checkRateLimit("key-reset", config);

      // t=50s: blocked — earliest is t=5s, resets at t=65s
      vi.setSystemTime(50_000);
      const result = checkRateLimit("key-reset", config);

      expect(result.allowed).toBe(false);
      expect(result.resetAt).toBe(65); // (5000 + 60000) / 1000
      expect(result.retryAfterSeconds).toBe(15); // ceil((65000 - 50000) / 1000)
    });
  });

  describe("slidingWindowCheck — core", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns retryAfterMs with millisecond precision", () => {
      vi.setSystemTime(0);
      slidingWindowCheck("sw-test", 1, 60_000);

      vi.setSystemTime(45_000);
      const result = slidingWindowCheck("sw-test", 1, 60_000);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(15_000);
    });

    it("first request returns resetAt based on own timestamp", () => {
      vi.setSystemTime(10_000);
      const result = slidingWindowCheck("sw-first", 5, 60_000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      // resetAt = ceil((10000 + 60000) / 1000) = 70
      expect(result.resetAt).toBe(70);
      expect(result.retryAfterMs).toBe(60_000);
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
