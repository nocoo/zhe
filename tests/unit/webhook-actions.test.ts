import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearMockStorage } from "../setup";

// Mock auth
const mockUserId = "user-123";
vi.mock("@/auth", () => ({
  auth: vi.fn(() =>
    Promise.resolve({ user: { id: mockUserId, name: "Test" } }),
  ),
}));

// Mock ScopedDB
const mockGetWebhook = vi.fn();
const mockUpsertWebhook = vi.fn();
const mockDeleteWebhook = vi.fn();
const mockUpdateWebhookRateLimit = vi.fn();

vi.mock("@/lib/db/scoped", () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getWebhook: mockGetWebhook,
    upsertWebhook: mockUpsertWebhook,
    deleteWebhook: mockDeleteWebhook,
    updateWebhookRateLimit: mockUpdateWebhookRateLimit,
  })),
}));

// Mock generateWebhookToken
const mockToken = "550e8400-e29b-41d4-a716-446655440000";
vi.mock("@/models/webhook.server", () => ({
  generateWebhookToken: vi.fn(() => mockToken),
}));

import {
  getWebhookToken,
  createWebhookToken,
  revokeWebhookToken,
  updateWebhookRateLimit,
} from "@/actions/webhook";

describe("webhook actions", () => {
  beforeEach(() => {
    clearMockStorage();
    vi.clearAllMocks();
  });

  describe("getWebhookToken", () => {
    it("returns the existing token when found", async () => {
      const webhook = {
        id: 1,
        userId: mockUserId,
        token: "existing-token",
        rateLimit: 5,
        createdAt: new Date(),
      };
      mockGetWebhook.mockResolvedValue(webhook);

      const result = await getWebhookToken();
      expect(result).toEqual({
        success: true,
        data: { token: "existing-token", createdAt: webhook.createdAt, rateLimit: 5 },
      });
    });

    it("returns null data when no webhook exists", async () => {
      mockGetWebhook.mockResolvedValue(null);

      const result = await getWebhookToken();
      expect(result).toEqual({ success: true, data: null });
    });

    it("returns error when auth fails", async () => {
      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await getWebhookToken();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("createWebhookToken", () => {
    it("generates and stores a new token", async () => {
      const webhook = {
        id: 1,
        userId: mockUserId,
        token: mockToken,
        rateLimit: 5,
        createdAt: new Date(),
      };
      mockUpsertWebhook.mockResolvedValue(webhook);

      const result = await createWebhookToken();
      expect(result).toEqual({
        success: true,
        data: { token: mockToken, createdAt: webhook.createdAt, rateLimit: 5 },
      });
      expect(mockUpsertWebhook).toHaveBeenCalledWith(mockToken);
    });

    it("returns error when auth fails", async () => {
      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await createWebhookToken();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("revokeWebhookToken", () => {
    it("deletes the existing webhook", async () => {
      mockDeleteWebhook.mockResolvedValue(true);

      const result = await revokeWebhookToken();
      expect(result).toEqual({ success: true });
      expect(mockDeleteWebhook).toHaveBeenCalled();
    });

    it("returns success even when no webhook existed", async () => {
      mockDeleteWebhook.mockResolvedValue(false);

      const result = await revokeWebhookToken();
      expect(result).toEqual({ success: true });
    });

    it("returns error when auth fails", async () => {
      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await revokeWebhookToken();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("updateWebhookRateLimit", () => {
    it("updates the rate limit", async () => {
      const webhook = {
        id: 1,
        userId: mockUserId,
        token: "test-token",
        rateLimit: 8,
        createdAt: new Date(),
      };
      mockUpdateWebhookRateLimit.mockResolvedValue(webhook);

      const result = await updateWebhookRateLimit(8);
      expect(result).toEqual({
        success: true,
        data: { rateLimit: 8 },
      });
      expect(mockUpdateWebhookRateLimit).toHaveBeenCalledWith(8);
    });

    it("rejects invalid rate limit values", async () => {
      const result = await updateWebhookRateLimit(15);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects zero rate limit", async () => {
      const result = await updateWebhookRateLimit(0);
      expect(result.success).toBe(false);
    });

    it("returns error when no webhook found", async () => {
      mockUpdateWebhookRateLimit.mockResolvedValue(null);

      const result = await updateWebhookRateLimit(5);
      expect(result.success).toBe(false);
      expect(result.error).toBe("No webhook found");
    });

    it("returns error when auth fails", async () => {
      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await updateWebhookRateLimit(5);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
