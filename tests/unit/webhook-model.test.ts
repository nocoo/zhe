import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWebhookToken } from "@/models/webhook.server";
import {
  validateWebhookPayload,
  checkRateLimit,
  buildOpenApiSpec,
  buildAgentPrompt,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_DEFAULT_MAX,
  RATE_LIMIT_ABSOLUTE_MAX,
  WEBHOOK_NOTE_MAX_LENGTH,
  clampRateLimit,
  isValidRateLimit,
} from "@/models/webhook";
import { unwrap } from "../test-utils";

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
      expect(unwrap(result.data).customSlug).toBeUndefined();
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
      expect(unwrap(result.data).folder).toBeUndefined();
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

    // ================================================================
    // note validation
    // ================================================================

    it("accepts valid payload with note", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        note: "Interesting article",
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        url: "https://example.com",
        note: "Interesting article",
      });
    });

    it("accepts payload with url, customSlug, folder, and note", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        customSlug: "my-slug",
        folder: "工作",
        note: "A note",
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        url: "https://example.com",
        customSlug: "my-slug",
        folder: "工作",
        note: "A note",
      });
    });

    it("accepts payload without note field", () => {
      const result = validateWebhookPayload({ url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(unwrap(result.data).note).toBeUndefined();
    });

    it("rejects non-string note", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        note: 123,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("note");
    });

    it("rejects empty note string", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        note: "",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("note");
    });

    it("rejects note exceeding max length", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        note: "a".repeat(WEBHOOK_NOTE_MAX_LENGTH + 1),
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("note");
    });

    it("trims note whitespace", () => {
      const result = validateWebhookPayload({
        url: "https://example.com",
        note: "  trimmed note  ",
      });
      expect(result.success).toBe(true);
      expect(unwrap(result.data).note).toBe("trimmed note");
    });
  });

  // ==================================================================
  // buildOpenApiSpec
  // ==================================================================

  describe("buildOpenApiSpec", () => {
    const baseUrl = "https://zhe.example.com/api/link/create/test-token-123";

    it("returns a valid OpenAPI 3.1.0 object", () => {
      const spec = buildOpenApiSpec(baseUrl);
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.info.title).toBeDefined();
      expect(spec.info.version).toBeDefined();
    });

    it("includes the webhook URL as server", () => {
      const spec = buildOpenApiSpec(baseUrl);
      expect(spec.servers).toEqual([{ url: baseUrl }]);
    });

    it("defines HEAD, GET, and POST operations on '/'", () => {
      const spec = buildOpenApiSpec(baseUrl);
      const root = spec.paths["/"];
      expect(root.head).toBeDefined();
      expect(root.get).toBeDefined();
      expect(root.post).toBeDefined();
    });

    it("HEAD operation describes connection testing", () => {
      const spec = buildOpenApiSpec(baseUrl);
      const head = spec.paths["/"].head;
      expect(head.summary).toContain("Test connection");
      expect(head.responses["200"]).toBeDefined();
      expect(head.responses["404"]).toBeDefined();
    });

    it("GET operation describes status and schema retrieval", () => {
      const spec = buildOpenApiSpec(baseUrl);
      const get = spec.paths["/"].get;
      expect(get.summary).toBeDefined();
      expect(get.responses["200"]).toBeDefined();
      expect(get.responses["404"]).toBeDefined();
    });

    it("POST operation lists all request body properties including note", () => {
      const spec = buildOpenApiSpec(baseUrl);
      const post = spec.paths["/"].post;
      const schema = post.requestBody.content["application/json"].schema;
      expect(schema.required).toEqual(["url"]);
      expect(schema.properties.url).toBeDefined();
      expect(schema.properties.customSlug).toBeDefined();
      expect(schema.properties.folder).toBeDefined();
      expect(schema.properties.note).toBeDefined();
      expect(schema.properties.note.maxLength).toBe(WEBHOOK_NOTE_MAX_LENGTH);
    });

    it("POST operation includes 201, 200, 400, 404, 409, 429 responses", () => {
      const spec = buildOpenApiSpec(baseUrl);
      const responses = spec.paths["/"].post.responses;
      expect(responses["201"]).toBeDefined();
      expect(responses["200"]).toBeDefined();
      expect(responses["400"]).toBeDefined();
      expect(responses["404"]).toBeDefined();
      expect(responses["409"]).toBeDefined();
      expect(responses["429"]).toBeDefined();
    });

    it("uses default rate limit in POST description", () => {
      const spec = buildOpenApiSpec(baseUrl);
      const post = spec.paths["/"].post;
      expect(post.description).toContain(String(RATE_LIMIT_DEFAULT_MAX));
    });

    it("uses custom rate limit when provided", () => {
      const spec = buildOpenApiSpec(baseUrl, 8);
      const post = spec.paths["/"].post;
      expect(post.description).toContain("8");
      expect(spec.paths["/"].post.responses["429"].description).toContain("8");
    });

    it("POST 201 response schema includes slug, shortUrl, originalUrl", () => {
      const spec = buildOpenApiSpec(baseUrl);
      const created = spec.paths["/"].post.responses["201"];
      const props = created.content["application/json"].schema.properties;
      expect(props.slug).toBeDefined();
      expect(props.shortUrl).toBeDefined();
      expect(props.originalUrl).toBeDefined();
    });
  });

  // ==================================================================
  // buildAgentPrompt
  // ==================================================================

  describe("buildAgentPrompt", () => {
    const baseUrl = "https://zhe.example.com/api/link/create/test-token-123";

    it("includes the webhook URL", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).toContain(baseUrl);
    });

    it("includes schema discovery instructions", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).toContain("Schema Discovery");
      expect(prompt).toContain("GET");
      expect(prompt).toContain("OpenAPI");
    });

    it("includes all parameter names", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).toContain("url");
      expect(prompt).toContain("customSlug");
      expect(prompt).toContain("folder");
      expect(prompt).toContain("note");
    });

    it("includes idempotency info", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).toContain("Idempotent");
    });

    it("includes default rate limit", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).toContain(`${RATE_LIMIT_DEFAULT_MAX} requests per minute`);
    });

    it("includes custom rate limit when provided", () => {
      const prompt = buildAgentPrompt(baseUrl, 8);
      expect(prompt).toContain("8 requests per minute");
    });

    it("includes curl example with note parameter", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).toContain("curl");
      expect(prompt).toContain('"note"');
    });

    it("includes note max length constraint", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).toContain(String(WEBHOOK_NOTE_MAX_LENGTH));
    });

    it("omits tmp upload section when tmpUploadUrl is not provided", () => {
      const prompt = buildAgentPrompt(baseUrl);
      expect(prompt).not.toContain("Temporary File Upload");
      expect(prompt).not.toContain("/api/tmp/upload/");
    });

    it("includes tmp upload section when tmpUploadUrl is provided", () => {
      const tmpUrl = "https://zhe.example.com/api/tmp/upload/test-token-123";
      const prompt = buildAgentPrompt(baseUrl, 5, tmpUrl);
      expect(prompt).toContain("Temporary File Upload");
      expect(prompt).toContain(tmpUrl);
    });

    it("includes tmp upload curl example", () => {
      const tmpUrl = "https://zhe.example.com/api/tmp/upload/test-token-123";
      const prompt = buildAgentPrompt(baseUrl, 5, tmpUrl);
      expect(prompt).toContain(`curl -X POST ${tmpUrl}`);
      expect(prompt).toContain('-F "file=@myfile.zip"');
    });

    it("includes tmp upload constraints (max size, auto-cleanup, shared rate limit)", () => {
      const tmpUrl = "https://zhe.example.com/api/tmp/upload/test-token-123";
      const prompt = buildAgentPrompt(baseUrl, 7, tmpUrl);
      expect(prompt).toContain("10 MB");
      expect(prompt).toContain("1 hour");
      expect(prompt).toContain("7 requests per minute total");
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
});
