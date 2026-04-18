import { describe, it, expect } from "vitest";
import {
  evictExpiredTimestamps,
  calculateRetryAfterMs,
  calculateResetAt,
} from "@/lib/sliding-window";

describe("sliding-window helpers", () => {
  describe("evictExpiredTimestamps", () => {
    it("removes timestamps older than the window", () => {
      const now = 1_000_000;
      const windowMs = 1000;
      const ts = [now - 2000, now - 1500, now - 500, now - 100];

      evictExpiredTimestamps(ts, windowMs, now);

      expect(ts).toEqual([now - 500, now - 100]);
    });

    it("clears the array when all timestamps are expired", () => {
      const now = 1_000_000;
      const windowMs = 1000;
      const ts = [now - 5000, now - 4000, now - 3000];

      evictExpiredTimestamps(ts, windowMs, now);

      expect(ts).toEqual([]);
    });

    it("keeps the array intact when no timestamps are expired", () => {
      const now = 1_000_000;
      const windowMs = 1000;
      const ts = [now - 500, now - 100, now];

      evictExpiredTimestamps(ts, windowMs, now);

      expect(ts).toEqual([now - 500, now - 100, now]);
    });

    it("treats timestamp exactly at windowStart as expired (strict >)", () => {
      const now = 1_000_000;
      const windowMs = 1000;
      // windowStart = now - windowMs = 999_000; this entry is exactly at the boundary
      const ts = [999_000, 999_500];

      evictExpiredTimestamps(ts, windowMs, now);

      expect(ts).toEqual([999_500]);
    });

    it("handles an empty array", () => {
      const ts: number[] = [];
      evictExpiredTimestamps(ts, 1000, 1_000_000);
      expect(ts).toEqual([]);
    });

    it("returns the same array reference (mutates in place)", () => {
      const ts = [1, 2, 3];
      const result = evictExpiredTimestamps(ts, 100, 1_000_000);
      expect(result).toBe(ts);
    });
  });

  describe("calculateRetryAfterMs", () => {
    it("returns ms until the oldest timestamp expires", () => {
      const now = 1_000_000;
      const windowMs = 30_000;
      const oldest = now - 20_000;
      // expires at oldest + windowMs = now + 10_000 → 10_000ms remaining
      expect(calculateRetryAfterMs(oldest, windowMs, now)).toBe(10_000);
    });

    it("returns at least 1ms even if the oldest already expired", () => {
      const now = 1_000_000;
      const windowMs = 1000;
      const oldest = now - 5000; // way past expiry
      expect(calculateRetryAfterMs(oldest, windowMs, now)).toBe(1);
    });

    it("returns full window when oldest is now", () => {
      expect(calculateRetryAfterMs(1_000_000, 30_000, 1_000_000)).toBe(30_000);
    });
  });

  describe("calculateResetAt", () => {
    it("returns Unix seconds for oldest + windowMs", () => {
      // oldest = 1_700_000_000_000 ms, window = 30s → reset = 1_700_000_030 s
      expect(calculateResetAt(1_700_000_000_000, 30_000)).toBe(1_700_000_030);
    });

    it("rounds up partial seconds", () => {
      // oldest + windowMs = 1500ms → 1.5s → ceil → 2s
      expect(calculateResetAt(500, 1000)).toBe(2);
    });
  });
});
