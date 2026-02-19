import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWebhookToken } from "@/models/webhook.server";
import {
  validateWebhookPayload,
  checkRateLimit,
  buildWebhookDocumentation,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX,
  RATE_LIMIT_ABSOLUTE_MAX,
  clampRateLimit,
  isValidRateLimit,
} from "@/models/webhook";

describe("webhook model", () => {
  describe("generateWebhookToken", () => {
    it("returns a valid UUID v4 string", () => {
      const token = generateWebhookToken();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(token).toMatch(uuidRegex);
    });

    it("generates unique tokens on each call", () => {
      const tokens = new Set(Array.from({ length: 100 }, generateWebhookToken));
      expect(tokens.size).toBe(100);
    });
  });

  describe("validateWebhookPayload", () => {
    it("accepts valid payload with url only", () => {
      const result = validateWebhookPayload({ url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ url: "https://example.com" });
    });

    it("accepts valid payload with url and customSlug", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        customSlug: "my-slug",
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        url: "https://example.com",
        customSlug: "my-slug",
      });
    });

    it("rejects missing url", () => {
      const result = validateWebhookPayload({});
      expect(result.success).toBe(false);
      expect(result.error).toContain("url");
    });

    it("rejects non-string url", () => {
      const result = validateWebhookPayload({ url: 123 });
      expect(result.success).toBe(false);
      expect(result.error).toContain("url");
    });

    it("rejects invalid url format", () => {
      const result = validateWebhookPayload({ url: "not-a-url" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("url");
    });

    it("rejects empty url string", () => {
      const result = validateWebhookPayload({ url: "" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("url");
    });

    it("rejects non-string customSlug", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        customSlug: 123,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("customSlug");
    });

    it("rejects invalid customSlug format", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        customSlug: "has spaces",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("customSlug");
    });

    it("rejects reserved path as customSlug", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        customSlug: "dashboard",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("customSlug");
    });

    it("accepts payload without customSlug field", () => {
      const result = validateWebhookPayload({ url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.data!.customSlug).toBeUndefined();
    });

    it("accepts valid payload with folder", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        folder: "工作",
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        url: "https://example.com",
        folder: "工作",
      });
    });

    it("accepts payload with url, customSlug, and folder", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        customSlug: "my-slug",
        folder: "项目",
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        url: "https://example.com",
        customSlug: "my-slug",
        folder: "项目",
      });
    });

    it("accepts payload without folder field", () => {
      const result = validateWebhookPayload({ url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.data!.folder).toBeUndefined();
    });

    it("rejects non-string folder", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        folder: 123,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("folder");
    });

    it("rejects empty folder string", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        folder: "",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("folder");
    });

    it("rejects folder exceeding max length", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        folder: "a".repeat(51),
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("folder");
    });

    it("rejects non-object payload", () => {
      const result = validateWebhookPayload("string");
      expect(result.success).toBe(false);
    });

    it("rejects null payload", () => {
      const result = validateWebhookPayload(null);
      expect(result.success).toBe(false);
    });
  });

  describe("checkRateLimit", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("exports rate limit constants", () => {
      expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
      expect(RATE_LIMIT_DEFAULT_MAX).toBe(5);
      expect(RATE_LIMIT_ABSOLUTE_MAX).toBe(10);
    });

    it("allows requests within the limit", () => {
      const token = "test-token";
      for (let i = 0; i < RATE_LIMIT_DEFAULT_MAX; i++) {
        expect(checkRateLimit(token)).toEqual({ allowed: true });
      }
    });

    it("blocks requests exceeding the limit", () => {
      const token = "test-token-2";
      for (let i = 0; i < RATE_LIMIT_DEFAULT_MAX; i++) {
        checkRateLimit(token);
      }
      const result = checkRateLimit(token);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS);
    });

    it("resets after the window expires", () => {
      const token = "test-token-3";
      for (let i = 0; i < RATE_LIMIT_DEFAULT_MAX; i++) {
        checkRateLimit(token);
      }
      expect(checkRateLimit(token).allowed).toBe(false);

      vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);
      expect(checkRateLimit(token).allowed).toBe(true);
    });

    it("tracks tokens independently", () => {
      const tokenA = "token-a";
      const tokenB = "token-b";
      for (let i = 0; i < RATE_LIMIT_DEFAULT_MAX; i++) {
        checkRateLimit(tokenA);
      }
      expect(checkRateLimit(tokenA).allowed).toBe(false);
      expect(checkRateLimit(tokenB).allowed).toBe(true);
    });

    it("uses sliding window — old entries expire individually", () => {
      const token = "test-token-4";
      // Fill half at time 0 (use custom limit of 10 for this test)
      const limit = RATE_LIMIT_ABSOLUTE_MAX;
      for (let i = 0; i < limit / 2; i++) {
        checkRateLimit(token, limit);
      }
      // Advance 30 seconds, fill the rest
      vi.advanceTimersByTime(30_000);
      for (let i = 0; i < limit / 2; i++) {
        checkRateLimit(token, limit);
      }
      // Now at limit requests, should be blocked
      expect(checkRateLimit(token, limit).allowed).toBe(false);

      // Advance past the first batch's window (30s more)
      vi.advanceTimersByTime(30_001);
      // The first half expired, so we should have room
      expect(checkRateLimit(token, limit).allowed).toBe(true);
    });

    it("respects custom maxRequests parameter", () => {
      const token = "test-token-custom";
      const customLimit = 3;
      for (let i = 0; i < customLimit; i++) {
        expect(checkRateLimit(token, customLimit).allowed).toBe(true);
      }
      expect(checkRateLimit(token, customLimit).allowed).toBe(false);
    });

    it("uses default limit when maxRequests is not provided", () => {
      const token = "test-token-default";
      for (let i = 0; i < RATE_LIMIT_DEFAULT_MAX; i++) {
        expect(checkRateLimit(token).allowed).toBe(true);
      }
      expect(checkRateLimit(token).allowed).toBe(false);
    });
  });

  describe("clampRateLimit", () => {
    it("clamps values below 1 to 1", () => {
      expect(clampRateLimit(0)).toBe(1);
      expect(clampRateLimit(-5)).toBe(1);
    });

    it("clamps values above max to max", () => {
      expect(clampRateLimit(20)).toBe(RATE_LIMIT_ABSOLUTE_MAX);
      expect(clampRateLimit(100)).toBe(RATE_LIMIT_ABSOLUTE_MAX);
    });

    it("rounds to nearest integer", () => {
      expect(clampRateLimit(3.7)).toBe(4);
      expect(clampRateLimit(3.2)).toBe(3);
    });

    it("passes through valid values unchanged", () => {
      expect(clampRateLimit(5)).toBe(5);
      expect(clampRateLimit(1)).toBe(1);
      expect(clampRateLimit(RATE_LIMIT_ABSOLUTE_MAX)).toBe(RATE_LIMIT_ABSOLUTE_MAX);
    });
  });

  describe("isValidRateLimit", () => {
    it("accepts valid values", () => {
      expect(isValidRateLimit(1)).toBe(true);
      expect(isValidRateLimit(5)).toBe(true);
      expect(isValidRateLimit(RATE_LIMIT_ABSOLUTE_MAX)).toBe(true);
    });

    it("rejects values out of range", () => {
      expect(isValidRateLimit(0)).toBe(false);
      expect(isValidRateLimit(11)).toBe(false);
      expect(isValidRateLimit(-1)).toBe(false);
    });

    it("rejects non-numbers", () => {
      expect(isValidRateLimit("5")).toBe(false);
      expect(isValidRateLimit(null)).toBe(false);
      expect(isValidRateLimit(undefined)).toBe(false);
    });
  });

  describe("buildWebhookDocumentation", () => {
    const baseUrl = "https://zhe.example.com/api/webhook/test-token-123";

    it("returns an object with endpoint, method, and headers", () => {
      const docs = buildWebhookDocumentation(baseUrl);
      expect(docs.endpoint).toBe(baseUrl);
      expect(docs.method).toBe("POST");
      expect(docs.headers).toEqual({ "Content-Type": "application/json" });
    });

    it("includes request body parameters with descriptions", () => {
      const docs = buildWebhookDocumentation(baseUrl);
      expect(docs.body).toHaveProperty("url");
      expect(docs.body).toHaveProperty("customSlug");
      expect(docs.body).toHaveProperty("folder");
      expect(docs.body.url.required).toBe(true);
      expect(docs.body.customSlug.required).toBe(false);
      expect(docs.body.folder.required).toBe(false);
    });

    it("includes a curl example containing the webhook URL", () => {
      const docs = buildWebhookDocumentation(baseUrl);
      expect(docs.example.curl).toContain(baseUrl);
      expect(docs.example.curl).toContain("curl");
    });

    it("includes response schema with all fields", () => {
      const docs = buildWebhookDocumentation(baseUrl);
      expect(docs.response).toHaveProperty("slug");
      expect(docs.response).toHaveProperty("shortUrl");
      expect(docs.response).toHaveProperty("originalUrl");
    });

    it("includes rate limit information", () => {
      const docs = buildWebhookDocumentation(baseUrl);
      expect(docs.rateLimit.maxRequests).toBe(RATE_LIMIT_DEFAULT_MAX);
      expect(docs.rateLimit.windowMs).toBe(RATE_LIMIT_WINDOW_MS);
    });

    it("includes custom rate limit when provided", () => {
      const docs = buildWebhookDocumentation(baseUrl, 8);
      expect(docs.rateLimit.maxRequests).toBe(8);
      expect(docs.rateLimit.windowMs).toBe(RATE_LIMIT_WINDOW_MS);
    });

    it("includes error codes", () => {
      const docs = buildWebhookDocumentation(baseUrl);
      expect(docs.errors).toBeDefined();
      expect(docs.errors.length).toBeGreaterThan(0);
      // Should at least cover 400, 404, 409, 429
      const codes = docs.errors.map((e: { status: number }) => e.status);
      expect(codes).toContain(400);
      expect(codes).toContain(404);
      expect(codes).toContain(409);
      expect(codes).toContain(429);
    });

    it("includes idempotency notes", () => {
      const docs = buildWebhookDocumentation(baseUrl);
      expect(docs.notes).toBeDefined();
      expect(docs.notes.length).toBeGreaterThan(0);
      const notesText = docs.notes.join(" ");
      expect(notesText).toContain("Idempotent");
      expect(notesText).toContain("customSlug");
      expect(notesText).toContain("folder");
    });
  });
});
