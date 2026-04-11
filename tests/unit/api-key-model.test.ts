import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  parseScopes,
  serializeScopes,
  API_SCOPES,
} from "@/models/api-key";

describe("api-key model", () => {
  describe("generateApiKey", () => {
    it("returns fullKey starting with zhe_ prefix", () => {
      const { fullKey, prefix, keyHash } = generateApiKey();
      expect(fullKey).toMatch(/^zhe_/);
      expect(prefix).toBe(fullKey.substring(0, 12));
      expect(keyHash).toHaveLength(64); // SHA-256 hex
    });

    it("generates unique keys", () => {
      const keys = new Set(Array.from({ length: 10 }, () => generateApiKey().fullKey));
      expect(keys.size).toBe(10);
    });
  });

  describe("hash/verify round-trip", () => {
    it("verifies correct key", () => {
      const { fullKey, keyHash } = generateApiKey();
      expect(verifyApiKey(fullKey, keyHash)).toBe(true);
    });

    it("rejects wrong key", () => {
      const { keyHash } = generateApiKey();
      expect(verifyApiKey("zhe_wrongkey", keyHash)).toBe(false);
    });

    it("rejects modified hash", () => {
      const { fullKey } = generateApiKey();
      const wrongHash = "a".repeat(64);
      expect(verifyApiKey(fullKey, wrongHash)).toBe(false);
    });
  });

  describe("parseScopes", () => {
    it("parses valid scopes", () => {
      expect(parseScopes("links:read,links:write")).toEqual(["links:read", "links:write"]);
    });

    it("throws on invalid scope", () => {
      expect(() => parseScopes("links:read,invalid:scope")).toThrow("Invalid scopes");
    });

    it("handles whitespace", () => {
      expect(parseScopes(" links:read , folders:write ")).toEqual(["links:read", "folders:write"]);
    });
  });

  describe("serializeScopes", () => {
    it("serializes to comma-separated string", () => {
      expect(serializeScopes(["links:read", "links:write"])).toBe("links:read,links:write");
    });
  });
});
