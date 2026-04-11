import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authenticateApiKey, hasScope, requireAuth, requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { clearAllRateLimits } from "@/lib/api/rate-limit";
import * as db from "@/lib/db/api-keys";
import type { ApiScope } from "@/models/api-key";

// Mock the database module
vi.mock("@/lib/db/api-keys", () => ({
  verifyApiKeyAndGetUser: vi.fn(),
}));

describe("API Key Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllRateLimits();
  });

  describe("authenticateApiKey", () => {
    it("returns error when Authorization header is missing", async () => {
      const request = new NextRequest("http://localhost/api/test");

      const result = await authenticateApiKey(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Missing Authorization header");
        expect(result.status).toBe(401);
      }
    });

    it("returns error when Authorization header is not Bearer format", async () => {
      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Basic abc123" },
      });

      const result = await authenticateApiKey(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid Authorization header format");
        expect(result.status).toBe(401);
      }
    });

    it("returns error when API key does not start with zhe_", async () => {
      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer invalid_key_format" },
      });

      const result = await authenticateApiKey(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid API key format");
        expect(result.status).toBe(401);
      }
    });

    it("returns error when API key is not found in database", async () => {
      vi.mocked(db.verifyApiKeyAndGetUser).mockResolvedValue(null);

      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer zhe_abc123xyz" },
      });

      const result = await authenticateApiKey(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid or revoked API key");
        expect(result.status).toBe(401);
      }
    });

    it("returns success with auth info when key is valid", async () => {
      const mockAuth = {
        userId: "user-123",
        keyId: "key-456",
        keyPrefix: "zhe_validkey1",
        scopes: ["links:read", "links:write"] as ApiScope[],
      };
      vi.mocked(db.verifyApiKeyAndGetUser).mockResolvedValue(mockAuth);

      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer zhe_validkey123" },
      });

      const result = await authenticateApiKey(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.auth).toEqual(mockAuth);
      }
      expect(db.verifyApiKeyAndGetUser).toHaveBeenCalledWith("zhe_validkey123");
    });
  });

  describe("hasScope", () => {
    it("returns true when scope is present", () => {
      const auth = {
        userId: "user-123",
        keyId: "key-456",
        keyPrefix: "zhe_test1234",
        scopes: ["links:read", "links:write"] as ApiScope[],
      };

      expect(hasScope(auth, "links:read")).toBe(true);
      expect(hasScope(auth, "links:write")).toBe(true);
    });

    it("returns false when scope is not present", () => {
      const auth = {
        userId: "user-123",
        keyId: "key-456",
        keyPrefix: "zhe_test1234",
        scopes: ["links:read"] as ApiScope[],
      };

      expect(hasScope(auth, "links:write")).toBe(false);
      expect(hasScope(auth, "folders:read")).toBe(false);
    });
  });

  describe("apiError", () => {
    it("creates a JSON error response with correct status", async () => {
      const response = apiError("Something went wrong", 500);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Something went wrong" });
    });

    it("creates 401 response for unauthorized", async () => {
      const response = apiError("Unauthorized", 401);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });
  });

  describe("requireAuth", () => {
    it("returns NextResponse error when auth fails", async () => {
      const request = new NextRequest("http://localhost/api/test");

      const result = await requireAuth(request, "links:read");

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(401);
    });

    it("returns NextResponse 403 when scope is missing", async () => {
      const mockAuth = {
        userId: "user-123",
        keyId: "key-456",
        keyPrefix: "zhe_validkey1",
        scopes: ["links:read"] as ApiScope[], // Only read, no write
      };
      vi.mocked(db.verifyApiKeyAndGetUser).mockResolvedValue(mockAuth);

      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer zhe_validkey123" },
      });

      const result = await requireAuth(request, "links:write"); // Requires write

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Insufficient permissions");
    });

    it("returns auth result when auth and scope check pass", async () => {
      const mockAuth = {
        userId: "user-123",
        keyId: "key-456",
        keyPrefix: "zhe_validkey1",
        scopes: ["links:read", "links:write"] as ApiScope[],
      };
      vi.mocked(db.verifyApiKeyAndGetUser).mockResolvedValue(mockAuth);

      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer zhe_validkey123" },
      });

      const result = await requireAuth(request, "links:read");

      expect(result).not.toBeInstanceOf(Response);
      expect(result).toEqual(mockAuth);
    });
  });

  describe("requireAuthWithRateLimit", () => {
    it("returns auth result with rate limit headers on success", async () => {
      const mockAuth = {
        userId: "user-123",
        keyId: "key-rl-1",
        keyPrefix: "zhe_validkey1",
        scopes: ["links:read"] as ApiScope[],
      };
      vi.mocked(db.verifyApiKeyAndGetUser).mockResolvedValue(mockAuth);

      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer zhe_validkey123" },
      });

      const result = await requireAuthWithRateLimit(request, "links:read");

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.auth).toEqual(mockAuth);
        expect(result.headers["X-RateLimit-Limit"]).toBe("100");
        expect(result.headers["X-RateLimit-Remaining"]).toBeDefined();
        expect(result.headers["X-RateLimit-Reset"]).toBeDefined();
      }
    });

    it("returns 429 when rate limit exceeded", async () => {
      const mockAuth = {
        userId: "user-123",
        keyId: "key-rl-2",
        keyPrefix: "zhe_validkey1",
        scopes: ["links:read"] as ApiScope[],
      };
      vi.mocked(db.verifyApiKeyAndGetUser).mockResolvedValue(mockAuth);

      const config = { maxRequests: 2, windowMs: 60_000 };

      // Use up the rate limit
      for (let i = 0; i < 2; i++) {
        const request = new NextRequest("http://localhost/api/test", {
          headers: { Authorization: "Bearer zhe_validkey123" },
        });
        await requireAuthWithRateLimit(request, "links:read", config);
      }

      // This request should be rate limited
      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer zhe_validkey123" },
      });
      const result = await requireAuthWithRateLimit(request, "links:read", config);

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("returns 401 when auth fails", async () => {
      const request = new NextRequest("http://localhost/api/test");
      const result = await requireAuthWithRateLimit(request, "links:read");

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(401);
    });

    it("returns 403 when scope is missing", async () => {
      const mockAuth = {
        userId: "user-123",
        keyId: "key-rl-3",
        keyPrefix: "zhe_validkey1",
        scopes: ["links:read"] as ApiScope[],
      };
      vi.mocked(db.verifyApiKeyAndGetUser).mockResolvedValue(mockAuth);

      const request = new NextRequest("http://localhost/api/test", {
        headers: { Authorization: "Bearer zhe_validkey123" },
      });

      const result = await requireAuthWithRateLimit(request, "links:write");

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(403);
    });
  });
});
