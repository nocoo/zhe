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

vi.mock("@/lib/db/scoped", () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getWebhook: mockGetWebhook,
    upsertWebhook: mockUpsertWebhook,
    deleteWebhook: mockDeleteWebhook,
  })),
}));

// Mock generateWebhookToken
const mockToken = "550e8400-e29b-41d4-a716-446655440000";
vi.mock("@/models/webhook", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/webhook")>();
  return {
    ...original,
    generateWebhookToken: vi.fn(() => mockToken),
  };
});

import {
  getWebhookToken,
  createWebhookToken,
  revokeWebhookToken,
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
        createdAt: new Date(),
      };
      mockGetWebhook.mockResolvedValue(webhook);

      const result = await getWebhookToken();
      expect(result).toEqual({
        success: true,
        data: { token: "existing-token", createdAt: webhook.createdAt },
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
        createdAt: new Date(),
      };
      mockUpsertWebhook.mockResolvedValue(webhook);

      const result = await createWebhookToken();
      expect(result).toEqual({
        success: true,
        data: { token: mockToken, createdAt: webhook.createdAt },
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
});
