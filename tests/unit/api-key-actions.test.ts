// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockStorage, getMockApiKeys } from "../mocks/db-storage";

// Mock auth-context before importing actions
const mockUserId = "user-test";
vi.mock("@/lib/auth-context", () => ({
  getScopedDB: vi.fn(),
}));

import {
  createApiKeyAction,
  listApiKeys,
  migrateFromWebhookAction,
  revokeApiKeyAction,
} from "@/actions/api-keys";
import { getScopedDB } from "@/lib/auth-context";
import { ScopedDB } from "@/lib/db/scoped";

describe("api-key actions", () => {
  beforeEach(() => {
    clearMockStorage();
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 8, 14, 2, 3, 26, 987));
    vi.mocked(getScopedDB).mockResolvedValue(new ScopedDB(mockUserId));
  });
  afterEach(() => vi.restoreAllMocks());

  describe("createApiKeyAction", () => {
    it("creates a key and returns fullKey only once", async () => {
      const result = await createApiKeyAction({
        name: "Test Key",
        scopes: ["links:read", "links:write"],
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.fullKey).toMatch(/^zhe_/);
      expect(result.data.name).toBe("Test Key");
      expect(result.data.prefix).toBe(result.data.fullKey.substring(0, 12));
      expect(result.data.expiresAt).toBeNull();
      expect(getMockApiKeys().get(result.data.id)?.expires_at).toBeNull();
    });

    it.each([30, 7, 3, 1])(
      "persists an explicitly selected %i-day lifetime in seconds",
      async (days) => {
        const result = await createApiKeyAction({
          name: "Expiring Key",
          scopes: ["connector:write"],
          expiresInDays: days,
        });
        expect(result.success).toBe(true);
        if (!result.success) return;
        const expiresAt = Math.floor(Date.now() / 1000) + days * 86400;
        expect(getMockApiKeys().get(result.data.id)?.expires_at).toBe(expiresAt);
        expect(result.data.expiresAt?.getTime()).toBe(expiresAt * 1000);
        const listed = await listApiKeys();
        expect(listed.success && listed.data[0]?.expiresAt?.getTime()).toBe(expiresAt * 1000);
      },
    );

    it("accepts an explicit permanent lifetime", async () => {
      const result = await createApiKeyAction({
        name: "Permanent Key",
        scopes: ["connector:write"],
        expiresInDays: null,
      });
      expect(result.success && result.data.expiresAt).toBeNull();
    });

    it.each([0, -1, 1 / 1440, 2, 31, NaN, Infinity, "1", "never"])(
      "rejects unsupported or too-short lifetime %s without creating a key",
      async (expiresInDays) => {
        const result = await createApiKeyAction({
          name: "Invalid Lifetime",
          scopes: ["connector:write"],
          expiresInDays: expiresInDays as never,
        });
        expect(result.success).toBe(false);
        expect(getMockApiKeys().size).toBe(0);
      },
    );

    it("rejects empty name", async () => {
      const result = await createApiKeyAction({ name: "", scopes: ["links:read"] });
      expect(result.success).toBe(false);
    });

    it("rejects name over 64 chars", async () => {
      const result = await createApiKeyAction({ name: "a".repeat(65), scopes: ["links:read"] });
      expect(result.success).toBe(false);
    });

    it("rejects empty scopes", async () => {
      const result = await createApiKeyAction({ name: "Key", scopes: [] });
      expect(result.success).toBe(false);
    });

    it("rejects invalid scopes", async () => {
      const result = await createApiKeyAction({
        name: "Key",
        scopes: ["links:read", "invalid:scope" as never],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid scopes");
        expect(result.error).toContain("invalid:scope");
      }
    });

    it("returns unauthorized when not logged in (create)", async () => {
      vi.mocked(getScopedDB).mockResolvedValue(null);
      const result = await createApiKeyAction({ name: "Key", scopes: ["links:read"] });
      expect(result).toEqual({ success: false, error: "Unauthorized" });
    });
  });

  describe("listApiKeys", () => {
    it("returns list of keys without hashes", async () => {
      await createApiKeyAction({ name: "Key 1", scopes: ["links:read"] });
      await createApiKeyAction({ name: "Key 2", scopes: ["folders:read"] });

      const result = await listApiKeys();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(2);
      // Should NOT contain keyHash or fullKey
      result.data.forEach((k) => {
        expect(k).not.toHaveProperty("keyHash");
        expect(k).not.toHaveProperty("fullKey");
        expect(k).toHaveProperty("prefix");
        expect(k).toHaveProperty("name");
      });
    });

    it("returns unauthorized when not logged in", async () => {
      vi.mocked(getScopedDB).mockResolvedValue(null);
      const result = await listApiKeys();
      expect(result).toEqual({ success: false, error: "Unauthorized" });
    });
  });

  describe("revokeApiKeyAction", () => {
    it("revokes an existing key", async () => {
      const created = await createApiKeyAction({ name: "Revokable", scopes: ["links:read"] });
      expect(created.success).toBe(true);
      if (!created.success) return;

      const result = await revokeApiKeyAction(created.data.id);
      expect(result.success).toBe(true);

      // Verify key is gone from list
      const list = await listApiKeys();
      expect(list.success).toBe(true);
      if (!list.success) return;
      expect(list.data).toHaveLength(0);
    });

    it("returns error for non-existent key", async () => {
      const result = await revokeApiKeyAction("nonexistent");
      expect(result.success).toBe(false);
    });

    it("returns error for empty id", async () => {
      const result = await revokeApiKeyAction("");
      expect(result.success).toBe(false);
    });

    it("returns unauthorized when not logged in", async () => {
      vi.mocked(getScopedDB).mockResolvedValue(null);
      const result = await revokeApiKeyAction("some-id");
      expect(result).toEqual({ success: false, error: "Unauthorized" });
    });
  });

  describe("migrateFromWebhookAction", () => {
    it("creates a key with links:read and links:write scopes", async () => {
      const result = await migrateFromWebhookAction();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.fullKey).toMatch(/^zhe_/);
      expect(result.data.name).toBe("Migrated from Webhook");
      expect(result.data.scopes).toContain("links:read");
      expect(result.data.scopes).toContain("links:write");
      expect(result.data.expiresAt).toBeNull();
    });

    it("returns unauthorized when not logged in", async () => {
      vi.mocked(getScopedDB).mockResolvedValue(null);
      const result = await migrateFromWebhookAction();
      expect(result).toEqual({ success: false, error: "Unauthorized" });
    });
  });
});
