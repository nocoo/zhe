// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock d1-client to return a row with mismatched hash
const mockExecuteD1Query = vi.fn();
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
}));

// Mock the api-key model — verifyApiKey returns false for mismatch
const mockVerifyApiKey = vi.fn();
const mockHashApiKey = vi.fn();
const mockParseScopes = vi.fn();
vi.mock("@/models/api-key", () => ({
  hashApiKey: (...args: unknown[]) => mockHashApiKey(...args),
  verifyApiKey: (...args: unknown[]) => mockVerifyApiKey(...args),
  parseScopes: (...args: unknown[]) => mockParseScopes(...args),
}));

import { verifyApiKeyAndGetUser } from "@/lib/db/api-keys";

afterEach(() => vi.restoreAllMocks());

describe("verifyApiKeyAndGetUser — explicit expiry", () => {
  const now = Date.UTC(2026, 8, 14, 2, 3, 26);
  it.each([
    ["permanent", null, true],
    ["before expiry", now / 1000 + 1, true],
    ["at expiry", now / 1000, false],
    ["after expiry", now / 1000 - 1, false],
    ["epoch expiry", 0, false],
  ])("accepts only active keys (%s)", async (_, expiresAt, accepted) => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockHashApiKey.mockReturnValue("test-hash");
    mockVerifyApiKey.mockReturnValue(true);
    mockParseScopes.mockReturnValue(["links:read"]);
    mockExecuteD1Query.mockResolvedValue([
      {
        id: "key-1",
        prefix: "test-prefix",
        user_id: "user-123",
        scopes: "links:read",
        revoked_at: null,
        expires_at: expiresAt,
        key_hash: "test-hash",
      },
    ]);
    expect(Boolean(await verifyApiKeyAndGetUser("test-key"))).toBe(accepted);
    expect(mockExecuteD1Query.mock.calls.some(([sql]) => sql.includes("SET last_used_at"))).toBe(
      accepted,
    );
  });
});

describe("verifyApiKeyAndGetUser — rejection diagnostics", () => {
  const now = Date.UTC(2026, 8, 14, 2, 3, 34);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockHashApiKey.mockReturnValue("private-hash");
    mockVerifyApiKey.mockReturnValue(true);
  });

  it.each([
    ["revoked", now / 1000 - 15, null],
    ["expired", null, now / 1000],
  ])("logs only the verified record ID and %s reason", async (reason, revokedAt, expiresAt) => {
    mockExecuteD1Query.mockResolvedValue([
      {
        id: "record-id",
        prefix: "private-prefix",
        user_id: "private-user",
        scopes: "links:read",
        revoked_at: revokedAt,
        expires_at: expiresAt,
        key_hash: "private-hash",
      },
    ]);

    expect(await verifyApiKeyAndGetUser("private-credential")).toBeNull();
    expect(mockVerifyApiKey).toHaveBeenCalledWith("private-credential", "private-hash");
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ event: "api_key_auth_rejected", keyId: "record-id", reason }),
    );
    expect(mockExecuteD1Query).toHaveBeenCalledTimes(1);
  });

  it.each(["unknown", "hash mismatch"])(
    "does not log unverified credentials (%s)",
    async (kind) => {
      mockExecuteD1Query.mockResolvedValue(
        kind === "unknown"
          ? []
          : [{ id: "record-id", revoked_at: now / 1000 - 15, key_hash: "different-hash" }],
      );
      mockVerifyApiKey.mockReturnValue(false);

      expect(await verifyApiKeyAndGetUser("private-credential")).toBeNull();
      expect(console.warn).not.toHaveBeenCalled();
      expect(mockExecuteD1Query).toHaveBeenCalledTimes(1);
    },
  );
});

describe("verifyApiKeyAndGetUser — hash mismatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when verifyApiKey fails (hash mismatch)", async () => {
    mockHashApiKey.mockReturnValue("hashed-key");
    // DB returns a row that matches the hash lookup, is not revoked
    mockExecuteD1Query.mockResolvedValue([
      {
        id: "key-1",
        prefix: "zhe_abc12345",
        user_id: "user-123",
        scopes: "links:read",
        revoked_at: null,
        key_hash: "different-hash",
      },
    ]);
    // But constant-time comparison fails
    mockVerifyApiKey.mockReturnValue(false);

    const result = await verifyApiKeyAndGetUser("zhe_some-fake-key");

    expect(result).toBeNull();
    expect(mockVerifyApiKey).toHaveBeenCalledWith("zhe_some-fake-key", "different-hash");
  });
});
