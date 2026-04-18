import { describe, it, expect, vi, beforeEach } from "vitest";

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
