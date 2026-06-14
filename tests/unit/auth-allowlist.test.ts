// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isEmailAllowed,
  parseAllowedEmails,
  signInCallback,
} from "@/lib/auth-allowlist";

describe("parseAllowedEmails", () => {
  it("returns null when env var is unset", () => {
    expect(parseAllowedEmails(undefined)).toBeNull();
  });

  it("returns null for empty / whitespace-only string", () => {
    expect(parseAllowedEmails("")).toBeNull();
    expect(parseAllowedEmails("   ")).toBeNull();
    expect(parseAllowedEmails(",, ,")).toBeNull();
  });

  it("trims, lowercases, and dedupes entries", () => {
    const set = parseAllowedEmails("A@example.com, b@Example.COM ,a@example.com");
    expect(set).not.toBeNull();
    expect(Array.from(set as Set<string>).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });
});

describe("isEmailAllowed", () => {
  it("permits any email when allowlist is null (legacy mode)", () => {
    expect(isEmailAllowed("anyone@example.com", null)).toBe(true);
    expect(isEmailAllowed(null, null)).toBe(true);
  });

  it("rejects empty/missing email when allowlist is set", () => {
    const allow = new Set(["owner@example.com"]);
    expect(isEmailAllowed(null, allow)).toBe(false);
    expect(isEmailAllowed(undefined, allow)).toBe(false);
    expect(isEmailAllowed("", allow)).toBe(false);
  });

  it("matches case-insensitively", () => {
    const allow = new Set(["owner@example.com"]);
    expect(isEmailAllowed("Owner@Example.COM", allow)).toBe(true);
  });

  it("rejects emails not in the allowlist", () => {
    const allow = new Set(["owner@example.com"]);
    expect(isEmailAllowed("attacker@example.com", allow)).toBe(false);
  });
});

describe("signInCallback (NextAuth boundary)", () => {
  const KEY = "AUTH_ALLOWED_EMAILS";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
    Reflect.deleteProperty(process.env, KEY);
  });

  afterEach(() => {
    if (saved === undefined) Reflect.deleteProperty(process.env, KEY);
    else process.env[KEY] = saved;
  });

  it("permits Google sign-in for any email when allowlist is unset", () => {
    const result = signInCallback({
      user: { email: "anyone@example.com" },
      account: { provider: "google" },
    });
    expect(result).toBe(true);
  });

  it("permits Google sign-in for an allowlisted email", () => {
    process.env[KEY] = "owner@example.com,teammate@example.com";
    const result = signInCallback({
      user: { email: "owner@example.com" },
      account: { provider: "google" },
    });
    expect(result).toBe(true);
  });

  it("rejects Google sign-in for an email not in the allowlist", () => {
    process.env[KEY] = "owner@example.com";
    const result = signInCallback({
      user: { email: "attacker@example.com" },
      account: { provider: "google" },
    });
    expect(result).toBe(false);
  });

  it("rejects Google sign-in when email is missing from the OAuth response", () => {
    process.env[KEY] = "owner@example.com";
    const result = signInCallback({
      user: { email: null },
      account: { provider: "google" },
    });
    expect(result).toBe(false);
  });

  it("matches allowlist case-insensitively at the callback boundary", () => {
    process.env[KEY] = "Owner@Example.com";
    const result = signInCallback({
      user: { email: "owner@example.COM" },
      account: { provider: "google" },
    });
    expect(result).toBe(true);
  });

  it("always permits the e2e-credentials provider, regardless of allowlist", () => {
    process.env[KEY] = "owner@example.com";
    const result = signInCallback({
      user: { email: "e2e@test.local" },
      account: { provider: "e2e-credentials" },
    });
    expect(result).toBe(true);
  });

  it("rejects unknown provider with non-allowlisted email when allowlist is set", () => {
    process.env[KEY] = "owner@example.com";
    const result = signInCallback({
      user: { email: "attacker@example.com" },
      account: { provider: "github" },
    });
    expect(result).toBe(false);
  });

  it("tolerates a missing account object", () => {
    process.env[KEY] = "owner@example.com";
    const result = signInCallback({
      user: { email: "owner@example.com" },
      account: null,
    });
    expect(result).toBe(true);
  });
});
